import { useMemo } from "react";
import "./Greeting.css";

interface GreetingProps {
  userName: string;
}

export default function Greeting({ userName }: GreetingProps) {
  const text = useMemo(() => {
    const variants = [`How can I help, ${userName}?`, `Hey, ${userName}. Ready to dive in?`];
    return variants[Math.floor(Math.random() * variants.length)];
  }, [userName]);

  return <h1 className="greeting">{text}</h1>;
}
