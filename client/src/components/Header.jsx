import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="bg-indigo-700 text-white shadow-md">
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <Link
          to="/"
          className="text-xl font-bold tracking-tight hover:text-indigo-200 transition-colors"
        >
          🚀 ScrumBoard
        </Link>
      </div>
    </header>
  );
}
