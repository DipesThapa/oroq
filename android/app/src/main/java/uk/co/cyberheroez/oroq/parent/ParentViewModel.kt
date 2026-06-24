package uk.co.cyberheroez.oroq.parent

import android.app.Application
import android.widget.Toast
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilyCommand
import uk.co.cyberheroez.oroq.family.FamilyStore

data class ParentUiState(
    val snapshots: List<ChildSnapshot> = emptyList(),
    val stats: FamilyStats = Insights.derive(emptyList(), 0L),
    val refreshing: Boolean = false,
    val lastRefresh: Long = 0L,
)

class ParentViewModel(app: Application) : AndroidViewModel(app) {
    private val store = FamilyStore(app)
    private val repo = ParentRepository(app)
    private val _state = MutableStateFlow(ParentUiState())
    val state: StateFlow<ParentUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.value = _state.value.copy(refreshing = true)
        viewModelScope.launch(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            val snapshots = store.getChildren().map { child ->
                val fetched = repo.fetchSummary(child.pairingId)
                ChildSnapshot(
                    pairingId = child.pairingId,
                    label = child.label,
                    summary = fetched?.summary,
                    fetchedAt = now,
                    serverReceivedAt = fetched?.serverReceivedAt,
                )
            }
            _state.value = ParentUiState(
                snapshots = snapshots,
                stats = Insights.derive(snapshots, now),
                refreshing = false,
                lastRefresh = now,
            )
        }
    }

    /** Unpairs [pairingId] (server + local), refreshes, then invokes [onDone] on the main thread. */
    fun unpair(pairingId: String, onDone: () -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            repo.unpairChild(pairingId)
            refresh()
            withContext(Dispatchers.Main) { onDone() }
        }
    }

    /** Sends [command] to one child (or every child when [pairingId] is null), then refreshes. */
    fun send(pairingId: String?, command: FamilyCommand) {
        viewModelScope.launch(Dispatchers.IO) {
            val targets = if (pairingId != null) listOf(pairingId)
            else _state.value.snapshots.map { it.pairingId }
            val allOk = targets.isNotEmpty() && targets.all { repo.sendCommand(it, command) }
            withContext(Dispatchers.Main) {
                Toast.makeText(
                    getApplication(),
                    if (allOk) "Sent — the phone updates shortly"
                    else "Couldn't send — check your connection",
                    Toast.LENGTH_SHORT,
                ).show()
            }
            refresh()
        }
    }
}
