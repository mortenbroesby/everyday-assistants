export type PickerHost<Result = unknown, Context = unknown> = {
  sendMessage(message: { role: "user"; content: Array<{ type: "text"; text: string }> }): Promise<unknown>;
  ontoolresult?: (result: Result) => void;
  onhostcontextchanged?: (context: Context) => void;
};

export type PickerSelection = { ingredient: string; product: number; quantity: number };

const message = (text: string) => ({ role: "user" as const, content: [{ type: "text" as const, text }] });

export const bindPickerHost = <Result, Context>(host: PickerHost<Result, Context>, onResult: (result: Result) => void, onContext?: (context: Context) => void) => {
  let active = true;
  let messagePending = false;
  const handleResult = (result: Result) => { if (active) onResult(result); };
  const handleContext = (context: Context) => { if (active) onContext?.(context); };
  const send = (text: string): Promise<unknown> => {
    if (!active || messagePending) return Promise.resolve();
    messagePending = true;
    return host.sendMessage(message(text)).finally(() => { messagePending = false; });
  };
  host.ontoolresult = handleResult;
  if (onContext) host.onhostcontextchanged = handleContext;
  return {
    sendSelections: (selections: readonly PickerSelection[]) => send(
      `Use these replacement choices and keep every unchallenged selection unchanged: ${JSON.stringify(selections)}. Show one complete final basket recap with review_proposed_basket in recap mode. Do not change the basket.`,
    ),
    sendApproval: (selections: readonly PickerSelection[]) => send(
      `I approve this exact final basket recap: ${JSON.stringify(selections)}. Continue through the protected exact basket-addition review and apply only this unchanged selection. Freshly validate before writing, do not retry an uncertain write, and show the basket readback.`,
    ),
    dispose: () => {
      active = false;
      if (host.ontoolresult === handleResult) host.ontoolresult = undefined;
      if (host.onhostcontextchanged === handleContext) host.onhostcontextchanged = undefined;
    },
  };
};
