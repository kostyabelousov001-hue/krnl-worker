import Foundation

struct WorkerTask: Codable {
    let type: String
    let query: String?
    let pass: Int?
    let maxPasses: Int?
    let items: [TaskItem]?
    let leads: [LeadItem]?
}

struct TaskItem: Codable {
    let url: String
    let rating: String?
    let reviews: String?
}

struct LeadItem: Codable {
    let name: String
    let rating: String?
    let reviews: String?
    let phone: String?
    let website: String?
    let url: String?
    let emails: String?
}

struct StatusMessage: Codable {
    let type: String
    let status: String
    let settings: WorkerSettings?
}

struct WorkerSettings: Codable {
    let searchWebsites: Bool
    let useWebKit: Bool
    let crawlPercentage: Double
    let configServerURL: String
}

struct LogMessage: Codable {
    let type: String
    let message: String
}

struct DetailsBatch: Codable {
    let type: String
    let results: [ScrapedPlace]
}

struct WebBatch: Codable {
    let type: String
    let results: [ScrapedWebsite]
}

struct DiscoveryBatch: Codable {
    let type: String
    let urls: [DiscoveryURL]
}

struct DiscoveryURL: Codable {
    let href: String
    let rating: String
    let reviews: String
}

struct ScrapedPlace: Codable {
    let name: String
    let rating: String
    let reviews: String
    let phone: String
    let website: String
    let url: String
}

struct ScrapedWebsite: Codable {
    let name: String
    let rating: String
    let reviews: String
    let phone: String
    let website: String
    let url: String
    let emails: String
    let facebook: String
    let instagram: String
    let linkedin: String
}