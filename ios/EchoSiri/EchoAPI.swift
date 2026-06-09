import Foundation

// Thin client for the two-phase /api/siri/capture endpoint.
//
//   preview(transcript:)  → POST { transcript }
//        returns the spoken read-back + the tool calls to confirm.
//   commit(toolCalls:)    → POST { confirm: true, toolCalls }
//        persists the confirmed tool calls.
//
// toolCalls flow through opaquely: we never need to understand their shape
// on-device, we just hold the JSON from phase 1 and echo it back in phase 2.

struct EchoPreviewResponse {
    let spoken: String
    let hasWrites: Bool
    let toolCalls: [Any]   // raw JSON array, passed back verbatim
}

struct EchoCommitResponse {
    let spoken: String
}

enum EchoAPIError: Error, LocalizedError {
    case notConfigured
    case http(Int, String)
    case malformed

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Echo ist nicht konfiguriert (Token oder URL fehlt)."
        case .http(let code, _): return "Echo antwortete mit Fehler \(code)."
        case .malformed: return "Unerwartete Antwort von Echo."
        }
    }
}

enum EchoAPI {
    private static func request(body: [String: Any]) async throws -> [String: Any] {
        guard !EchoConfig.apiToken.isEmpty,
              EchoConfig.baseURL.host != "YOUR-ECHO-DEPLOYMENT.example.com" else {
            throw EchoAPIError.notConfigured
        }
        var req = URLRequest(url: EchoConfig.captureURL)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(EchoConfig.apiToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (200..<300).contains(status) else {
            let spoken = json["spoken"] as? String ?? ""
            throw EchoAPIError.http(status, spoken)
        }
        return json
    }

    static func preview(transcript: String) async throws -> EchoPreviewResponse {
        let json = try await request(body: ["transcript": transcript])
        guard let spoken = json["spoken"] as? String else { throw EchoAPIError.malformed }
        return EchoPreviewResponse(
            spoken: spoken,
            hasWrites: json["has_writes"] as? Bool ?? false,
            toolCalls: json["toolCalls"] as? [Any] ?? []
        )
    }

    static func commit(transcript: String, toolCalls: [Any]) async throws -> EchoCommitResponse {
        let json = try await request(body: [
            "confirm": true,
            "transcript": transcript,
            "toolCalls": toolCalls,
        ])
        return EchoCommitResponse(spoken: json["spoken"] as? String ?? "Gespeichert.")
    }
}
