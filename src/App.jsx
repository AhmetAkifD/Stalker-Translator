import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Translator from './pages/Translator';
import DeasciifierReview from './pages/DeasciifierReview';
import WitcherTranslator from './pages/witcher/WitcherTranslator';
import DarkMessiahTranslator from './pages/darkmessiah/DarkMessiahTranslator';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/translator" element={<Translator />} />
        <Route path="/glossary" element={<Translator initialMode="glossary" />} />
        <Route path="/deasciifier" element={<DeasciifierReview />} />
        <Route path="/witcher" element={<WitcherTranslator />} />
        <Route path="/darkmessiah" element={<DarkMessiahTranslator />} />
      </Routes>
    </Router>
  );
}

export default App;
