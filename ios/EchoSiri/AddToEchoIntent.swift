import AppIntents

// "Hey Siri, Notiz an Echo" → dictate → Echo reads back what it understood
// → "Soll ich das speichern?" → "Ja" → saved.
//
// Requires iOS 16+. Add this file to an iOS app target in Xcode and expose
// it via EchoSiriShortcuts (AppShortcutsProvider) so the phrase works
// without the user manually building a Shortcut.
@available(iOS 16.0, *)
struct AddToEchoIntent: AppIntent {
    static var title: LocalizedStringResource = "An Echo senden"
    static var description = IntentDescription(
        "Diktiere eine Notiz, einen Kontakt oder eine Erinnerung und speichere sie in Echo."
    )

    // Siri prompts for this with the dialog below; the user dictates.
    @Parameter(title: "Was möchtest du festhalten?", requestValueDialog: "Was möchtest du in Echo festhalten?")
    var transcript: String

    static var parameterSummary: some ParameterSummary {
        Summary("\(\.$transcript) in Echo festhalten")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        // Phase 1: preview. Echo extracts and reads back what it understood.
        let preview = try await EchoAPI.preview(transcript: transcript)

        // Nothing to write (e.g. a question Echo just answered) → speak and stop.
        guard preview.hasWrites else {
            return .result(dialog: IntentDialog(stringLiteral: preview.spoken))
        }

        // Honour the "never auto-apply" rule: confirm before committing.
        try await requestConfirmation(
            result: .result(dialog: IntentDialog(stringLiteral: preview.spoken))
        )

        // Phase 2: commit the exact tool calls Echo returned in phase 1.
        let committed = try await EchoAPI.commit(
            transcript: transcript,
            toolCalls: preview.toolCalls
        )
        return .result(dialog: IntentDialog(stringLiteral: committed.spoken))
    }
}
