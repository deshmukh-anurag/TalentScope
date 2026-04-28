import "./App.css";
import { Header } from "./shared/components/Header";

export function App({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen w-full flex-col bg-neutral-50 text-neutral-800">
      <Header />
      {children}
    </main>
  );
}
