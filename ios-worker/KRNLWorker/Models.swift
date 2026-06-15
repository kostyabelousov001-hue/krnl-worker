import Foundation
import Network

struct WorkerTask: Codable {
    let type: String
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
}

struct DetailsBatch: Codable {
    let type: String
    let results: [ScrapedPlace]
}

struct WebBatch: Codable {
    let type: String
    let results: [ScrapedWebsite]
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

struct WorkerConfig: Codable {
    var hostURL: String
    var port: String
}