import type { App } from "@modelcontextprotocol/ext-apps";
import { useApp, useAutoResize, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppFrame } from "../ui/AppFrame.js";
import "../ui/styles.css";
import { type PickerPayload, readPickerPayload } from "./contract.js";
import { PickerView } from "./PickerView.js";
import { bindPickerHost } from "./session.js";

const APP_INFO = { name: "Nemlig Picker", version: "1.0.0" } as const;
type HostContext = NonNullable<ReturnType<App["getHostContext"]>>;

function Picker() {
  const [payload, setPayload] = useState<PickerPayload>();
  const [failure, setFailure] = useState("");
  const [hostContext, setHostContext] = useState<HostContext>();
  const [pendingChoice, setPendingChoice] = useState<string>();
  const [selectedChoice, setSelectedChoice] = useState<string>();
  const pending = useRef(false);
  const generation = useRef(0);
  const binding = useRef<ReturnType<typeof bindPickerHost> | undefined>(undefined);
  const { app, error } = useApp({
    appInfo: APP_INFO,
    capabilities: {},
    autoResize: false,
    onAppCreated: (host) => {
      binding.current?.dispose();
      binding.current = bindPickerHost(host, (result) => {
        generation.current += 1;
        pending.current = false;
        setPendingChoice(undefined);
        setSelectedChoice(undefined);
        const nextPayload = readPickerPayload(result);
        setPayload(nextPayload);
        setFailure(nextPayload ? "" : "Forslaget kunne ikke vises.");
      }, (context) => setHostContext((current) => ({ ...current, ...context })));
    },
  });

  useHostStyles(app, app?.getHostContext());
  useAutoResize(app);

  useEffect(() => () => {
    generation.current += 1;
    pending.current = false;
    binding.current?.dispose();
  }, []);

  const choose = (id: number, ingredient: string, choice: string) => {
    if (pending.current || !binding.current) return;
    pending.current = true;
    setPendingChoice(choice);
    setFailure("");
    const currentGeneration = generation.current;
    void binding.current.sendChoice(id, ingredient).then(() => {
      if (currentGeneration !== generation.current) return;
      pending.current = false;
      setPendingChoice(undefined);
      setSelectedChoice(choice);
    }).catch(() => {
      if (currentGeneration !== generation.current) return;
      pending.current = false;
      setPendingChoice(undefined);
      setFailure("Valget kunne ikke sendes. Prøv igen.");
    });
  };

  return <AppFrame safeAreaInsets={hostContext?.safeAreaInsets ?? app?.getHostContext()?.safeAreaInsets}>
    <PickerView payload={payload} failure={failure || (error ? "Forbindelsen kunne ikke oprettes. Prøv igen." : "")} pendingChoice={pendingChoice} selectedChoice={selectedChoice} onChoose={choose} />
  </AppFrame>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Picker root is missing.");
createRoot(root).render(<StrictMode><Picker /></StrictMode>);
