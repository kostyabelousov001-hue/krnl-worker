// Scraper Worker Script v2
// Hot-swappable — update this file on the server,
// all iOS workers get the new logic on next task without reloading IPA.

(function() {
    window.KRNL = window.KRNL || {};
    var KRNL = window.KRNL;
    
    // Callback registry for bridge async-await model
    var callbacks = {};
    var callbackCounter = 0;

    // Mutex to protect sequential WebView navigation
    var webViewMutex = {
        locked: false,
        queue: [],
        acquire: function() {
            var self = this;
            return new Promise(function(resolve) {
                if (!self.locked) {
                    self.locked = true;
                    resolve();
                } else {
                    self.queue.push(resolve);
                }
            });
        },
        release: function() {
            if (this.queue.length > 0) {
                var next = this.queue.shift();
                next();
            } else {
                this.locked = false;
            }
        }
    };

    // Helper for parallel task execution with concurrency limits
    async function parallelLimit(items, limit, fn) {
        var results = [];
        var index = 0;
        
        async function worker() {
            while (index < items.length) {
                var currIndex = index++;
                var res = await fn(items[currIndex], currIndex);
                results[currIndex] = res;
            }
        }
        
        var workers = [];
        for (var i = 0; i < Math.min(limit, items.length); i++) {
            workers.push(worker());
        }
        await Promise.all(workers);
        return results;
    }

    KRNL.onCallback = function(id, result) {
        if (callbacks[id]) {
            callbacks[id](result);
            delete callbacks[id];
        }
    };

    // Bridge helpers (Promises)
    function loadURL(url) {
        return new Promise(function(resolve) {
            var id = "cb_" + (++callbackCounter);
            callbacks[id] = resolve;
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.krnlBridge) {
                window.webkit.messageHandlers.krnlBridge.postMessage({
                    action: "loadURL",
                    url: url,
                    callback: id
                });
            } else {
                resolve("false");
            }
        });
    }

    function evaluateInPage(jsCode) {
        return new Promise(function(resolve) {
            var id = "cb_" + (++callbackCounter);
            callbacks[id] = resolve;
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.krnlBridge) {
                window.webkit.messageHandlers.krnlBridge.postMessage({
                    action: "evaluateInPage",
                    js: jsCode,
                    callback: id
                });
            } else {
                resolve("N/A");
            }
        });
    }

    function fetchHTML(url) {
        return new Promise(function(resolve) {
            var id = "cb_" + (++callbackCounter);
            callbacks[id] = resolve;
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.krnlBridge) {
                window.webkit.messageHandlers.krnlBridge.postMessage({
                    action: "fetchHTML",
                    url: url,
                    callback: id
                });
            } else {
                resolve("N/A");
            }
        });
    }

    function log(msg) {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.krnlBridge) {
            window.webkit.messageHandlers.krnlBridge.postMessage({
                action: "log",
                message: "[JS] " + msg
            });
        } else {
            console.log("[JS]", msg);
        }
    }

    function sendRaw(data) {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.krnlBridge) {
            window.webkit.messageHandlers.krnlBridge.postMessage({
                action: "sendRaw",
                data: JSON.stringify(data)
            });
        }
    }

    function sendDetailsBatch(results) {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.krnlBridge) {
            window.webkit.messageHandlers.krnlBridge.postMessage({
                action: "sendDetailsBatch",
                results: results
            });
        }
    }

    function sendWebBatch(results) {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.krnlBridge) {
            window.webkit.messageHandlers.krnlBridge.postMessage({
                action: "sendWebBatch",
                results: results
            });
        }
    }

    // Helper functions for scraping
    KRNL.extractPlaceDetails = function() {
        var h1 = document.querySelector('h1.DUwDvf, h1');
        var name = h1 ? h1.textContent.trim() : 'N/A';

        var phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"] div.fontBodyMedium, button[data-item-id^="phone:"] div.fontBodyMedium');
        var phone = phoneBtn ? phoneBtn.textContent.trim() : 'N/A';

        var siteEl = document.querySelector('a[data-item-id="authority"] div.fontBodyMedium, a[data-item-id="authority"]');
        var website = siteEl ? siteEl.textContent.trim() : 'N/A';

        return JSON.stringify({ name: name, phone: phone, website: website });
    };

    KRNL.extractWebsiteContacts = function() {
        var body = document.body ? document.body.innerText : '';
        var emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        var emails = [];
        var match;
        while ((match = emailRegex.exec(body)) !== null) {
            var ext = match[0].split('.').pop().toLowerCase();
            if (!['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js'].includes(ext)) {
                emails.push(match[0]);
            }
        }
        emails = [...new Set(emails)];

        var links = Array.from(document.querySelectorAll('a[href]')).map(function(a) { return a.href; });
        var fb = links.find(function(l) { return l.includes('facebook.com'); }) || 'N/A';
        var ig = links.find(function(l) { return l.includes('instagram.com'); }) || 'N/A';
        var li = links.find(function(l) { return l.includes('linkedin.com'); }) || 'N/A';

        return JSON.stringify({
            emails: emails.join(', ') || 'N/A',
            fb: fb,
            ig: ig,
            li: li
        });
    };

    KRNL.extractLeadsFromList = function() {
        var results = [];
        var cards = document.querySelectorAll('a[href*="/maps/place/"]');
        cards.forEach(function(card) {
            var href = card.href;
            if (!href) return;
            var container = card.closest('div[role="article"]') || card.closest('.Nv2PK') || card.parentElement;
            
            // Filter out advertising cards (e.g. "Why this ad?", "Niyə bu reklam?")
            var text = (container ? container.textContent : card.textContent) || '';
            var textLower = text.toLowerCase();
            if (textLower.includes("reklam") || 
                textLower.includes("why this ad") || 
                textLower.includes("adchoices") || 
                textLower.includes("реклама") || 
                textLower.includes("about this ad") ||
                textLower.includes("sponsored") ||
                textLower.includes("advertisement")) {
                return;
            }
            var rating = 'N/A', reviews = '0';
            if (container) {
                var spans = container.querySelectorAll('span');
                for (var i = 0; i < spans.length; i++) {
                    var t = spans[i].textContent.trim().replace(',', '.');
                    var n = parseFloat(t);
                    if (!isNaN(n) && n >= 1.0 && n <= 5.0 && t.length <= 4 && !spans[i].querySelector('span')) {
                        rating = t;
                        break;
                    }
                }
                var fullText = container.textContent;
                var rvM = fullText.match(/\((\d[\d\s,.]*)\)/);
                if (rvM) reviews = rvM[1].replace(/\D/g, '');
            }
            results.push({ href: href, rating: rating, reviews: reviews });
        });
        return JSON.stringify(results);
    };

    function extractContactsFromHTML(html) {
        if (!html || html === 'N/A') return { emails: 'N/A', facebook: 'N/A', instagram: 'N/A', linkedin: 'N/A' };
        
        // Emails
        var emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        var emails = [];
        var match;
        while ((match = emailRegex.exec(html)) !== null) {
            var ext = match[0].split('.').pop().toLowerCase();
            if (!['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js'].includes(ext)) {
                emails.push(match[0]);
            }
        }
        emails = [...new Set(emails)];
        
        // Socials
        var fbM = html.match(/href="([^"]*facebook\.com\/[a-zA-Z0-9._-]+)"/i);
        var igM = html.match(/href="([^"]*instagram\.com\/[a-zA-Z0-9._-]+)"/i);
        var liM = html.match(/href="([^"]*(?:linkedin\.com\/company\/|linkedin\.com\/in\/)[a-zA-Z0-9._-]+)"/i);
        
        return {
            emails: emails.join(', ') || 'N/A',
            facebook: fbM ? fbM[1] : 'N/A',
            instagram: igM ? igM[1] : 'N/A',
            linkedin: liM ? liM[1] : 'N/A'
        };
    }

    function findContactPageLink(html, baseUrl) {
        try {
            var linkRegex = /href="([^"]*)"/ig;
            var match;
            var keywords = ['contact', 'about', 'контакт', 'support', 'help'];
            while ((match = linkRegex.exec(html)) !== null) {
                var href = match[1];
                var hrefLower = href.toLowerCase();
                if (keywords.some(function(kw) { return hrefLower.includes(kw); })) {
                    if (href.indexOf('http') === 0) {
                        return href;
                    } else {
                        var base = baseUrl.replace(/\/$/, '');
                        if (href.indexOf('/') === 0) {
                            return base + href;
                        } else {
                            return base + '/' + href;
                        }
                    }
                }
            }
        } catch(e) {}
        return null;
    }

    // --- ORCHESTRATED API ENTRIES called by iOS KRNLWorker App ---

    KRNL.discover = async function(query, pass) {
        try {
            log("Discovering: \"" + query + "\" (Pass " + pass + ")...");
            var encodedQuery = encodeURIComponent(query);
            var url = "https://www.google.com/maps/search/" + encodedQuery;
            
            var loaded = await loadURL(url);
            if (!loaded || loaded === "false") {
                log("Failed to load Google Maps search URL");
                sendRaw({ type: "DISCOVERY_BATCH", urls: [] });
                return;
            }
            
            await new Promise(function(r) { setTimeout(r, 2000); });
            
            // Handle Google Consent Page if prompt appears
            await evaluateInPage(`(function() {
                try {
                    var buttons = Array.from(document.querySelectorAll('button'));
                    var consentBtn = buttons.find(b => {
                        var t = b.textContent.toLowerCase();
                        return t.includes("reject all") || t.includes("accept all") || t.includes("принять") || t.includes("отклонить") || t.includes("agree");
                    });
                    if (consentBtn) {
                        consentBtn.click();
                        return "clicked";
                    }
                } catch(e) {}
                return "none";
            })()`);
            
            await new Promise(function(r) { setTimeout(r, 1000); });
            
            var allUrls = [];
            var noNewCount = 0;
            var previousCount = 0;
            
            for (var scroll = 0; scroll < 15; scroll++) {
                // Scroll down the feed
                await evaluateInPage(`(function() {
                    var feed = document.querySelector('div[role="feed"]');
                    if (feed) {
                        feed.scrollBy(0, 800);
                        feed.scrollTop = feed.scrollHeight;
                    } else {
                        window.scrollBy(0, 800);
                    }
                })()`);
                
                await new Promise(function(r) { setTimeout(r, 1000); });
                
                // Extract leads
                var itemsJSON = await evaluateInPage(`(function() {
                    var results = [];
                    var cards = document.querySelectorAll('a[href*="/maps/place/"]');
                    cards.forEach(function(card) {
                        var href = card.href;
                        if (!href) return;
                        var container = card.closest('div[role="article"]') || card.closest('.Nv2PK') || card.parentElement;
                        
                        // Filter out advertising cards (e.g. "Why this ad?", "Niyə bu reklam?")
                        var text = (container ? container.textContent : card.textContent) || '';
                        var textLower = text.toLowerCase();
                        if (textLower.includes("reklam") || 
                            textLower.includes("why this ad") || 
                            textLower.includes("adchoices") || 
                            textLower.includes("реклама") || 
                            textLower.includes("about this ad") ||
                            textLower.includes("sponsored") ||
                            textLower.includes("advertisement")) {
                            return;
                        }
                        var rating = 'N/A', reviews = '0';
                        if (container) {
                            var spans = container.querySelectorAll('span');
                            for (var i = 0; i < spans.length; i++) {
                                var t = spans[i].textContent.trim().replace(',', '.');
                                var n = parseFloat(t);
                                if (!isNaN(n) && n >= 1.0 && n <= 5.0 && t.length <= 4 && !spans[i].querySelector('span')) {
                                    rating = t;
                                    break;
                                }
                            }
                            var fullText = container.textContent;
                            var rvM = fullText.match(/\\((\\d[\\d\\s,.]*)\\)/);
                            if (rvM) reviews = rvM[1].replace(/\\D/g, '');
                        }
                        results.push({ href: href, rating: rating, reviews: reviews });
                    });
                    return JSON.stringify(results);
                })()`);
                
                var items = [];
                try {
                    items = JSON.parse(itemsJSON);
                } catch(e) {
                    log("JSON parse error: " + e.message);
                }
                
                items.forEach(function(item) {
                    if (!allUrls.some(function(u) { return u.href === item.href; })) {
                        allUrls.push(item);
                    }
                });
                
                log("Scroll #" + (scroll + 1) + ": Found " + allUrls.length + " places total");
                
                var reachedEnd = await evaluateInPage(`(function() {
                    var endSpan = Array.from(document.querySelectorAll('span')).find(s => {
                        var t = s.textContent.toLowerCase();
                        return t.includes("reached the end") || t.includes("конец списка");
                    });
                    return endSpan ? "true" : "false";
                })()`);
                
                if (reachedEnd === "true") {
                    log("Reached end of list");
                    break;
                }
                
                if (allUrls.length === previousCount) {
                    noNewCount++;
                    if (noNewCount >= 5) {
                        log("No new items in 5 scrolls. Exiting scroll loop.");
                        break;
                    }
                } else {
                    noNewCount = 0;
                }
                previousCount = allUrls.length;
            }
            
            sendRaw({
                type: "DISCOVERY_BATCH",
                urls: allUrls
            });
        } catch(err) {
            log("Error in discover: " + err.message);
            sendRaw({ type: "DISCOVERY_BATCH", urls: [] });
        }
    };

    KRNL.extractDetails = async function(items) {
        try {
            log("Extracting details for " + items.length + " places...");
            var results = [];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                log("Extracting details (" + (i + 1) + "/" + items.length + "): " + item.url);
                
                var loaded = await loadURL(item.url);
                if (!loaded || loaded === "false") {
                    log("Failed to load: " + item.url);
                    continue;
                }
                
                // Wait for H1 name element
                var foundH1 = false;
                for (var wait = 0; wait < 10; wait++) {
                    var h1Check = await evaluateInPage("document.querySelector('h1') ? 'true' : 'false'");
                    if (h1Check === 'true') {
                        foundH1 = true;
                        break;
                    }
                    await new Promise(function(r) { setTimeout(r, 400); });
                }
                
                if (!foundH1) {
                    log("Warning: H1 not found");
                }
                
                var detailsJSON = await evaluateInPage(`(function() {
                    var h1s = Array.from(document.querySelectorAll('h1.DUwDvf, h1'));
                    var name = 'N/A';
                    for (var i = 0; i < h1s.length; i++) {
                        var text = h1s[i].textContent.trim();
                        var tLower = text.toLowerCase();
                        if (text.length > 1 && 
                            !tLower.includes("reklam") && 
                            !tLower.includes("why this ad") && 
                            !tLower.includes("adchoices") && 
                            !tLower.includes("реклама") && 
                            !tLower.includes("about this ad") &&
                            !tLower.includes("sponsored") &&
                            !tLower.includes("advertisement")) {
                            name = text;
                            break;
                        }
                    }
                    
                    var phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"] div.fontBodyMedium, button[data-item-id^="phone:"] div.fontBodyMedium');
                    var phone = phoneBtn ? phoneBtn.textContent.trim() : 'N/A';
                    
                    var siteEl = document.querySelector('a[data-item-id="authority"] div.fontBodyMedium, a[data-item-id="authority"]');
                    var website = siteEl ? siteEl.textContent.trim() : 'N/A';
                    
                    return JSON.stringify({ name: name, phone: phone, website: website });
                })()`);
                
                var details = { name: 'N/A', phone: 'N/A', website: 'N/A' };
                try {
                    details = JSON.parse(detailsJSON);
                } catch(e) {}
                
                if (details.name !== 'N/A') {
                    results.push({
                        name: details.name,
                        rating: item.rating || 'N/A',
                        reviews: item.reviews || '0',
                        phone: details.phone,
                        website: details.website,
                        url: item.url
                    });
                }
            }
            
            sendDetailsBatch(results);
        } catch(err) {
            log("Error in extractDetails: " + err.message);
            sendDetailsBatch([]);
        }
    };

    KRNL.crawlWebsites = async function(leads) {
        try {
            var settings = KRNL.settings || { searchWebsites: true, useWebKit: true, crawlPercentage: 1.0 };
            var limit = Math.ceil(leads.length * (settings.crawlPercentage || 1.0));
            log("Crawling " + limit + "/" + leads.length + " websites (WebKit: " + (settings.useWebKit ?? true) + ")...");
            
            var targetLeads = leads.slice(0, limit);
            
            // Execute crawls with a concurrency of 4
            var crawledResults = await parallelLimit(targetLeads, 4, async function(lead, idx) {
                var website = lead.website;
                if (!website || website === 'N/A') {
                    return {
                        name: lead.name,
                        rating: lead.rating || 'N/A',
                        reviews: lead.reviews || '0',
                        phone: lead.phone || 'N/A',
                        website: 'N/A',
                        url: lead.url || '',
                        emails: 'N/A',
                        facebook: 'N/A',
                        instagram: 'N/A',
                        linkedin: 'N/A'
                    };
                }
                
                var targetUrl = website.indexOf('http') === 0 ? website : 'http://' + website;
                log("Crawl (" + (idx + 1) + "/" + limit + "): " + targetUrl);
                
                var contacts = { emails: 'N/A', facebook: 'N/A', instagram: 'N/A', linkedin: 'N/A' };
                
                if (settings.useWebKit === false) {
                    // Fast parallel HTTP request
                    var html = await fetchHTML(targetUrl);
                    if (html && html !== 'N/A') {
                        contacts = extractContactsFromHTML(html);
                        
                        if (contacts.emails === 'N/A') {
                            var contactHref = findContactPageLink(html, targetUrl);
                            if (contactHref) {
                                log("Checking contact page (fetch): " + contactHref);
                                var contactHtml = await fetchHTML(contactHref);
                                var contactContacts = extractContactsFromHTML(contactHtml);
                                if (contactContacts.emails !== 'N/A') contacts.emails = contactContacts.emails;
                                if (contactContacts.facebook !== 'N/A') contacts.facebook = contactContacts.facebook;
                                if (contactContacts.instagram !== 'N/A') contacts.instagram = contactContacts.instagram;
                                if (contactContacts.linkedin !== 'N/A') contacts.linkedin = contactContacts.linkedin;
                            }
                        }
                    }
                } else {
                    // Full WebKit browser load (Sequentialized via Mutex since there is only 1 WebView instance)
                    await webViewMutex.acquire();
                    try {
                        var loaded = await loadURL(targetUrl);
                        if (loaded && loaded !== "false") {
                            await new Promise(function(r) { setTimeout(r, 2000); });
                            var pageContactsJSON = await evaluateInPage(`(function() {
                                ${KRNL.extractWebsiteContacts.toString()}
                                return KRNL.extractWebsiteContacts();
                            })()`);
                            
                            try {
                                contacts = JSON.parse(pageContactsJSON);
                            } catch(e) {}
                            
                            if (contacts.emails === 'N/A') {
                                var contactUrlInPage = await evaluateInPage(`(function() {
                                    var links = Array.from(document.querySelectorAll('a'));
                                    var keywords = ['contact', 'about', 'контакт', 'о нас', 'support', 'help', 'career'];
                                    var found = links.find(a => {
                                        var text = a.textContent.toLowerCase();
                                        var href = a.getAttribute('href') || '';
                                        return keywords.some(kw => text.includes(kw) || href.toLowerCase().includes(kw));
                                    });
                                    return found ? found.href : null;
                                })()`);
                                
                                if (contactUrlInPage && contactUrlInPage.indexOf('http') === 0) {
                                    log("Checking contact page (WebKit): " + contactUrlInPage);
                                    var loadedContact = await loadURL(contactUrlInPage);
                                    if (loadedContact && loadedContact !== "false") {
                                        await new Promise(function(r) { setTimeout(r, 1500); });
                                        var contactContactsJSON = await evaluateInPage(`(function() {
                                            ${KRNL.extractWebsiteContacts.toString()}
                                            return KRNL.extractWebsiteContacts();
                                        })()`);
                                        try {
                                            var contactContacts = JSON.parse(contactContactsJSON);
                                            if (contactContacts.emails !== 'N/A') contacts.emails = contactContacts.emails;
                                            if (contactContacts.facebook !== 'N/A') contacts.facebook = contactContacts.facebook;
                                            if (contactContacts.instagram !== 'N/A') contacts.instagram = contactContacts.instagram;
                                            if (contactContacts.linkedin !== 'N/A') contacts.linkedin = contactContacts.linkedin;
                                        } catch(e) {}
                                    }
                                }
                            }
                        }
                    } finally {
                        webViewMutex.release();
                    }
                }
                
                return {
                    name: lead.name,
                    rating: lead.rating || 'N/A',
                    reviews: lead.reviews || '0',
                    phone: lead.phone || 'N/A',
                    website: website,
                    url: lead.url || '',
                    emails: contacts.emails,
                    facebook: contacts.facebook,
                    instagram: contacts.instagram,
                    linkedin: contacts.linkedin
                };
            });
            
            // Append skipped leads (exceeding crawlPercentage limit)
            for (var i = limit; i < leads.length; i++) {
                var lead = leads[i];
                crawledResults.push({
                    name: lead.name,
                    rating: lead.rating || 'N/A',
                    reviews: lead.reviews || '0',
                    phone: lead.phone || 'N/A',
                    website: lead.website || 'N/A',
                    url: lead.url || '',
                    emails: lead.emails || 'N/A',
                    facebook: 'N/A',
                    instagram: 'N/A',
                    linkedin: 'N/A'
                });
            }
            
            sendWebBatch(crawledResults);
        } catch(err) {
            log("Error in crawlWebsites: " + err.message);
            sendWebBatch([]);
        }
    };

    log("Worker script loaded successfully.");
})();