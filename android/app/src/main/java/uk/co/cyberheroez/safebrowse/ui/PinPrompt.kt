package uk.co.cyberheroez.safebrowse.ui

import android.content.Context
import android.text.InputType
import android.widget.EditText
import androidx.appcompat.app.AlertDialog

/**
 * Shows a numeric PIN dialog. Calls [onEntered] with the typed PIN when the
 * parent taps OK, or [onCancelled] if they dismiss it. When [onForgot] is
 * supplied, a neutral "Forgot PIN?" button is shown.
 */
fun showPinPrompt(
    context: Context,
    title: String,
    onEntered: (String) -> Unit,
    onCancelled: () -> Unit = {},
    onForgot: (() -> Unit)? = null,
) {
    val input = EditText(context).apply {
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        hint = "PIN"
    }
    val builder = AlertDialog.Builder(context)
        .setTitle(title)
        .setView(input)
        .setCancelable(false)
        .setPositiveButton("OK") { _, _ -> onEntered(input.text.toString()) }
        .setNegativeButton("Cancel") { _, _ -> onCancelled() }
    if (onForgot != null) {
        builder.setNeutralButton("Forgot PIN?") { _, _ -> onForgot() }
    }
    builder.show()
}
