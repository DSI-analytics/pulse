"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("pulso-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">
      {dark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
    </Button>
  );
}
