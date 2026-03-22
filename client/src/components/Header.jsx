import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="bg-indigo-700 text-white shadow-md">
      <div className="px-4 py-4">
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
