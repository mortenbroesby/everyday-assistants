import type { Preview } from "@storybook/react-vite";
import "../src/picker/styles.css";
import "./host-preview.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
  decorators: [
    (Story) => <div className="storybook-host-preview">
      <header className="storybook-host-preview__identity"><span className="storybook-host-preview__mark" aria-hidden="true">●</span><span>Nemlig Assistant</span></header>
      <div className="storybook-host-preview__card"><Story /></div>
    </div>,
  ],
};

export default preview;
