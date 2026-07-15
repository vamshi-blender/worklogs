import "./Greeting.css";

interface GreetingProps {
  userName: string;
}

export default function Greeting({ userName }: GreetingProps) {
  const variants = [`How can I help, ${userName}?`, `Hey, ${userName}. Ready to dive in?`];
  const nameScore = [...userName].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const text = variants[nameScore % variants.length];

  return <h1 className="greeting">{text}</h1>;
}
