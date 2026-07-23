import type { User } from "../services/users";
import { CsrfField } from "./csrf-field";

interface NavProps {
  page: string;
  user?: User | null;
  csrfToken?: string;
}

export const Nav = ({ page, user, csrfToken }: NavProps) => {
  const navLinks = [
    ...(user ? [{ href: "/new", label: "Build", name: "new" }] : []),
    ...(user ? [{ href: "/lists", label: "My lists", name: "lists" }] : []),
  ];

  return (
    <nav data-component="nav" aria-label="Main navigation">
      <ul>
        {navLinks.map(({ href, label, name }) => (
          <li key={name}>
            <a
              href={href}
              className={page === name ? "active" : undefined}
              aria-current={page === name ? "page" : undefined}
            >
              {label}
            </a>
          </li>
        ))}
        <li className="nav-auth">
          {user ? (
            <form method="post" action="/auth/logout">
              <CsrfField token={csrfToken ?? null} />
              <button type="submit" className="btn-ghost">
                Logout
              </button>
            </form>
          ) : (
            <a href="/signup" className="btn-ghost">
              Sign up
            </a>
          )}
        </li>
        {user && (
          <li>
            <a href="/new" className="btn-primary btn-nav-cta">
              Start a list
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
};
