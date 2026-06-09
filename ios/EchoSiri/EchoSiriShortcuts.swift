import AppIntents

// Registers the spoken trigger phrases so "Hey Siri, <phrase>" works as
// soon as the app is installed — no manual Shortcut building required.
//
// Phrases MUST contain \(.applicationName); include a few natural German
// variants. The app's display name is what the user says in place of
// \(.applicationName), so name the app "Echo" for "Notiz an Echo".
@available(iOS 16.0, *)
struct EchoSiriShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddToEchoIntent(),
            phrases: [
                "Notiz an \(.applicationName)",
                "An \(.applicationName) senden",
                "Speichere das in \(.applicationName)",
                "\(.applicationName) festhalten",
            ],
            shortTitle: "An Echo senden",
            systemImageName: "mic.circle"
        )
    }
}
