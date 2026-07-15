import type { DisplayMode } from "./mode";
import ChatLayout from "./components/ChatLayout";

interface AppProps {
  ctx: DisplayMode;
}

export default function App({ ctx }: AppProps) {
  return <ChatLayout ctx={ctx} />;
}
