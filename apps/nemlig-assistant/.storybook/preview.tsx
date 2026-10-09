import type { Decorator, Preview } from "@storybook/react-vite";
import "../src/picker/styles.css";
import "./host-preview.css";

export const embeddedConversation: Decorator = (Story) => (
  <div className="storybook-chatgpt-host storybook-chatgpt-host--embedded">
    <header className="storybook-chatgpt-host__identity">
      <span className="storybook-chatgpt-host__mark" aria-hidden="true">
        ●
      </span>
      <span>Nemlig Assistant</span>
    </header>
    <div className="storybook-chatgpt-host__card">
      <Story />
    </div>
  </div>
);

export const appTab: Decorator = (Story) => (
  <div className="storybook-chatgpt-host storybook-chatgpt-host--app-tab">
    <section
      className="storybook-chatgpt-host__app-panel"
      aria-label="ChatGPT app tab simulator"
    >
      <header className="storybook-chatgpt-host__tab-title">
        Show or start your Draft list
      </header>
      <div className="storybook-chatgpt-host__iframe">
        <Story />
      </div>
    </section>
  </div>
);

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
};

export default preview;
