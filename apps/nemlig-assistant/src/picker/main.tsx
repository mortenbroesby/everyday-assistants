import type { App } from "@modelcontextprotocol/ext-apps";
import { useApp, useAutoResize, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PickerFrame } from "./PickerFrame.js";
import "./styles.css";
import { type PickerPayload, readPickerPayload } from "./contract.js";
import { PickerView } from "./PickerView.js";
import { advancePicker, bindPickerHost, openPickerChoices, pickerModelContext, type PickerSelection } from "./session.js";

const APP_INFO = { name: "Nemlig Picker", version: "1.0.0" } as const;
type HostContext = NonNullable<ReturnType<App["getHostContext"]>>;

function Picker() {
  const [payload, setPayload] = useState<PickerPayload>();
  const [failure, setFailure] = useState("");
  const [hostContext, setHostContext] = useState<HostContext>();
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  const [pendingAction, setPendingAction] = useState(false);
  const [submittedAction, setSubmittedAction] = useState(false);
  const [backStack, setBackStack] = useState<PickerPayload[]>([]);
  const [forwardStack, setForwardStack] = useState<PickerPayload[]>([]);
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
        setPendingAction(false);
        setSubmittedAction(false);
        const nextPayload = readPickerPayload(result);
        setPayload(nextPayload);
        setBackStack([]);
        setForwardStack([]);
        setIncluded({});
        setChoices(Object.fromEntries(nextPayload?.items.map((item, index) => [index, item.product.id]) ?? []));
        setFailure(nextPayload ? "" : "The proposal could not be displayed.");
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

  useEffect(() => {
    if (!app || !payload || !app.getHostCapabilities()?.updateModelContext) return;
    void app.updateModelContext({
      content: [{ type: "text", text: "Current Nemlig shopping view state. Preserve these local selections when responding to the user's next shopping request." }],
      structuredContent: { nemligShoppingView: pickerModelContext(payload, choices, included) },
    }).catch(() => undefined);
  }, [app, choices, included, payload]);

  const submit = (direction: "back" | "next" = "next") => {
    if (pending.current || submittedAction || !binding.current || !payload) return;
    if (direction === "next" && payload.presentation === "list" && !payload.list.some((row, index) => included[index] ?? row.included)) return;
    const selections: PickerSelection[] = payload.items.map((item) => ({
      ingredient: item.ingredient,
      product: item.product.id,
      quantity: item.quantity,
    }));
    const approval = payload.presentation === "recap" && direction === "next";
    if (!approval) {
      if (direction === "back") {
        const previous = backStack.at(-1) ?? (payload.presentation === "proposal" && payload.journey ? { presentation: "list" as const, items: [], list: payload.journey.list } : undefined);
        if (previous) {
          setBackStack((current) => current.slice(0, -1));
          setForwardStack((current) => [payload, ...current]);
          setPayload(previous);
          return;
        }
      } else if (payload.presentation === "list" && forwardStack.length) {
        setBackStack((current) => [...current, payload]);
        setPayload(forwardStack[0]);
        setForwardStack((current) => current.slice(1));
        return;
      } else if (payload.presentation !== "list") {
        const proposal = [...backStack].reverse().find((view): view is Exclude<PickerPayload, { presentation: "list" }> => view.presentation === "proposal");
        const next = advancePicker(payload, choices, proposal);
        if (next) {
          setBackStack((current) => [...current, payload]);
          setForwardStack([]);
          setPayload(next);
          return;
        }
      }
    }
    pending.current = true;
    setPendingAction(true);
    setFailure("");
    const currentGeneration = generation.current;
    const action = approval
      ? binding.current.sendApproval(selections)
      : binding.current.sendNavigation(payload, direction, choices, included);
    void action.then(() => {
      if (currentGeneration !== generation.current) return;
      pending.current = false;
      setPendingAction(false);
      setSubmittedAction(true);
    }).catch(() => {
      if (currentGeneration !== generation.current) return;
      pending.current = false;
      setPendingAction(false);
      setSubmittedAction(true);
      setFailure(approval ? "The approval result is uncertain. Check the conversation and basket before requesting a fresh review; do not retry this approval." : "The navigation result is uncertain. Check the conversation before asking ChatGPT to show this step again.");
    });
  };

  return <PickerFrame safeAreaInsets={hostContext?.safeAreaInsets ?? app?.getHostContext()?.safeAreaInsets}>
    <PickerView
      payload={payload}
      failure={failure || (error ? "The connection could not be established. Try again." : "")}
      choices={choices}
      included={included}
      pending={pendingAction}
      submitted={submittedAction}
      onChoice={(itemIndex, productId) => setChoices((current) => ({ ...current, [itemIndex]: productId }))}
      onInclude={(index, value) => {
        setIncluded((current) => ({ ...current, [index]: value }));
        setForwardStack([]);
      }}
      onAlternatives={(index) => {
        if (!payload || payload.presentation === "list") return;
        const next = openPickerChoices(payload, index);
        if (!next) return;
        setBackStack((current) => [...current, payload]);
        setForwardStack([]);
        setPayload(next);
        setChoices(Object.fromEntries(next.items.map((item, itemIndex) => [itemIndex, item.product.id])));
      }}
      onBack={() => submit("back")}
      onSubmit={() => submit("next")}
    />
  </PickerFrame>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Picker root is missing.");
createRoot(root).render(<StrictMode><Picker /></StrictMode>);
