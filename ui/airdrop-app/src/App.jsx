import EligibilityChecker from './components/EligibilityChecker'
import './App.css'

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Airdrop Claim Portal</h1>
        <p>Check your eligibility and claim your tokens</p>
      </header>
      <main>
        <EligibilityChecker />
      </main>
    </div>
  )
}

export default App
