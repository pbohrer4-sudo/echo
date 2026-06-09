import Foundation

// Configuration for the Echo Siri / App Intents integration.
//
// SECURITY: do not hardcode the API token in source you commit. The token
// is a per-user secret minted by scripts/create-api-token.mjs. Store it in
// the Keychain (recommended) and read it here, or — for a quick personal
// build — drop it into the app's Info.plist under "ECHO_API_TOKEN" and
// keep that build private.
enum EchoConfig {
    // Your deployment's base URL, e.g. https://echo.example.com
    static let baseURL = URL(string: "https://YOUR-ECHO-DEPLOYMENT.example.com")!

    // Reads the token from Info.plist for the simple path. Swap this for a
    // Keychain lookup in a shared/production build.
    static var apiToken: String {
        (Bundle.main.object(forInfoDictionaryKey: "ECHO_API_TOKEN") as? String) ?? ""
    }

    static var captureURL: URL { baseURL.appendingPathComponent("/api/siri/capture") }
}
