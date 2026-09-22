import { RawDogIt } from "../../shared/ui/tribute/rawdogit";

export const HomeFooter = ({ html }: { html: string }): JSX.Element => (
  <div id="home-footer">
    <RawDogIt html={html} />
  </div>
);
