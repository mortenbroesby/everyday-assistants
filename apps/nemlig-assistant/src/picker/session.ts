export type PickerHost<Result = unknown, Context = unknown> = {
  sendMessage(message: { role: "user"; content: Array<{ type: "text"; text: string }> }): Promise<unknown>;
  ontoolresult?: (result: Result) => void;
  onhostcontextchanged?: (context: Context) => void;
};

export const bindPickerHost = <Result, Context>(host: PickerHost<Result, Context>, onResult: (result: Result) => void, onContext?: (context: Context) => void) => {
  let active = true;
  const handleResult = (result: Result) => { if (active) onResult(result); };
  const handleContext = (context: Context) => { if (active) onContext?.(context); };
  host.ontoolresult = handleResult;
  if (onContext) host.onhostcontextchanged = handleContext;
  return {
    sendChoice: (id: number, ingredient: string) => host.sendMessage({ role: "user", content: [{ type: "text", text: `Choose product ${id} for ${ingredient} instead.` }] }),
    dispose: () => {
      active = false;
      if (host.ontoolresult === handleResult) host.ontoolresult = undefined;
      if (host.onhostcontextchanged === handleContext) host.onhostcontextchanged = undefined;
    },
  };
};
