import { TrendTabs } from "./tabs";

export default function TrendsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TrendTabs />
      {children}
    </>
  );
}
