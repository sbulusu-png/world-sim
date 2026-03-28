import { useState, useEffect } from 'react'
import TopBar from './components/TopBar'
import CommandPanel from './components/CommandPanel'
import MapView from './components/MapView'
import SidePanel from './components/SidePanel'
import DebugConsole from './components/DebugConsole'
import ErrorBoundary from './components/ErrorBoundary'
import { useWorldState } from './hooks/useWorldState'
import './App.css'

function App() {
  const [selectedNation, setSelectedNation] = useState(null)
  const [targetNation, setTargetNation] = useState(null)
  const { worldState, loading, error, turnSummary, simRunning, debugStats, refreshState, triggerEvent, resetSimulation, startSim, pauseSim } = useWorldState()

  useEffect(() => { refreshState() }, [refreshState])

  // Clear target when source changes or matches target
  useEffect(() => {
    if (targetNation && targetNation === selectedNation) setTargetNation(null)
  }, [selectedNation, targetNation])

  return (
    <div className="app">
      <TopBar
        worldState={worldState}
        simRunning={simRunning}
        onStart={startSim}
        onPause={pauseSim}
        onReset={resetSimulation}
        loading={loading}
      />

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠</span>
          <span>{error}</span>
          <button onClick={refreshState}>RETRY</button>
        </div>
      )}

      <div className="app-body">
        <CommandPanel
          selectedNation={selectedNation}
          targetNation={targetNation}
          onTargetChange={setTargetNation}
          worldState={worldState}
          onAction={triggerEvent}
          loading={loading}
        />

        <main className="map-area">
          {worldState?.config?.worldEvent && (
            <div className="world-event-banner">
              <span className="world-event-icon">◈</span>
              <span className="world-event-text">
                WORLD_EVENT: {worldState.config.worldEvent.summary}
              </span>
            </div>
          )}

          <div className="map-container">
            {loading && !worldState && (
              <div className="loading-overlay">INITIALIZING THEATRE...</div>
            )}
            <ErrorBoundary>
              <MapView
                selectedNation={selectedNation}
                targetNation={targetNation}
                onNationClick={setSelectedNation}
                worldState={worldState}
              />
            </ErrorBoundary>
          </div>
        </main>

        <SidePanel
          selectedNation={selectedNation}
          targetNation={targetNation}
          worldState={worldState}
          turnSummary={turnSummary}
          onAction={triggerEvent}
          loading={loading}
        />
      </div>

      <DebugConsole debugStats={debugStats} turnSummary={turnSummary} />
    </div>
  )
}

export default App
