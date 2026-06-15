const axios = require('axios');

async function searchBounties() {
    console.log("Searching GitHub for active TON Footsteps and web3 bounties...");
    
    // Repositories to check
    const repos = [
        { owner: 'ton-society', repo: 'bounties' },
        { owner: 'ton-blockchain', repo: 'ton' }
    ];
    
    for (const { owner, repo } of repos) {
        console.log(`\nChecking repo: ${owner}/${repo}...`);
        try {
            const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=30`;
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            
            const issues = response.data;
            const bountyIssues = issues.filter(issue => {
                // Ignore pull requests
                if (issue.pull_request) return false;
                
                // Look for bounty/footstep/reward labels or keywords
                const hasBountyLabel = issue.labels.some(l => 
                    l.name.toLowerCase().includes('bounty') || 
                    l.name.toLowerCase().includes('reward') ||
                    l.name.toLowerCase().includes('footstep') ||
                    l.name.toLowerCase().includes('usd') ||
                    l.name.toLowerCase().includes('ton')
                );
                
                const hasBountyText = issue.title.toLowerCase().includes('bounty') || 
                                     issue.body?.toLowerCase().includes('reward') ||
                                     issue.body?.toLowerCase().includes('footstep');
                                     
                return hasBountyLabel || hasBountyText;
            });
            
            if (bountyIssues.length === 0) {
                console.log("No open bounty issues found in this repository.");
                continue;
            }
            
            console.log(`Found ${bountyIssues.length} potential bounty issues:`);
            for (const issue of bountyIssues) {
                console.log(`\n📌 [#${issue.number}] ${issue.title}`);
                console.log(`   URL: ${issue.html_url}`);
                console.log(`   Labels: ${issue.labels.map(l => l.name).join(', ')}`);
                // Print a small snippet of the body
                const bodySnippet = issue.body ? issue.body.substring(0, 150).replace(/\r?\n/g, ' ') + '...' : 'No description';
                console.log(`   Description: ${bodySnippet}`);
            }
        } catch (e) {
            console.error(`Error querying ${owner}/${repo}:`, e.message);
        }
    }
}

searchBounties().catch(console.error);
