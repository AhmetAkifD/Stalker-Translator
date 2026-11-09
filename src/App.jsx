import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Translator from './pages/Translator';
import DeasciifierReview from './pages/DeasciifierReview';
import DarkMessiahTranslator from './pages/darkmessiah/DarkMessiahTranslator';
import MetalGearTranslator from './pages/mg/MetalGearTranslator';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/translator" element={<Translator />} />
        <Route path="/glossary" element={<Translator initialMode="glossary" />} />
        <Route path="/deasciifier" element={<DeasciifierReview />} />
        <Route path="/darkmessiah" element={<DarkMessiahTranslator />} />
        <Route path="/metalgear" element={<MetalGearTranslator />} />
      </Routes>
    </Router>
  );
}

export default App;
