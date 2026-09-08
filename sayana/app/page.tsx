import { Nav } from "@/components/Nav";
import { SayanaHome } from "@/components/SayanaHome";

export default function Page() {
  return (
    <main className="shell">
      <Nav current="home" />
      <SayanaHome />
    </main>
  );
}
