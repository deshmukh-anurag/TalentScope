import { logout, useAuth } from "wasp/client/auth";
import { Link } from "wasp/client/router";
import Logo from "../../assets/logo.svg";
import { Button, ButtonLink } from "./Button";

export function Header() {
  const { data: user } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex justify-center border-b border-neutral-200 bg-white/90 shadow-sm backdrop-blur">
      <div className="flex w-full max-w-screen-xl items-center justify-between p-4 px-6 sm:px-12">
        <Link to={user ? "/interview" : "/"} className="flex items-center gap-2">
          <img src={Logo} alt="TalentScope Logo" className="h-9 w-9" />
          <h1 className="text-2xl font-semibold tracking-tight">TalentScope</h1>
        </Link>
        <nav>
          <ul className="flex gap-4 font-semibold">
            {user ? (
              <>
                <li>
                  <ButtonLink to="/interview" variant="ghost">Interview</ButtonLink>
                </li>
                <li>
                  <ButtonLink to="/results" variant="ghost">Results</ButtonLink>
                </li>
                <li>
                  <Button onClick={logout}>Log out</Button>
                </li>
              </>
            ) : (
              <>
                <li>
                  <ButtonLink to="/signup">Sign up</ButtonLink>
                </li>
                <li>
                  <ButtonLink to="/login" variant="ghost">
                    Login
                  </ButtonLink>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
