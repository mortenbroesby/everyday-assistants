export type PickerHost = {
  connect(): Promise<void>;
  close(): Promise<void>;
  getHostContext?(): { theme?: "light" | "dark" } | undefined;
  setupSizeChangedNotifications?(): () => void;
  sendMessage(message: { role: "user"; content: Array<{ type: "text"; text: string }> }): Promise<unknown>;
  ontoolresult?: (result: unknown) => void;
  onhostcontextchanged?: (context: { theme?: "light" | "dark" }) => void;
};

export const createPickerSession = (host: PickerHost, onResult: (result: unknown) => void, onTheme: (theme: "light" | "dark") => void) => {
  let active = true;
  let stopResize: (() => void) | undefined;
  host.ontoolresult = (result) => { if (active) onResult(result); };
  host.onhostcontextchanged = (context) => { if (active && context.theme) onTheme(context.theme); };
  const connected = host.connect().then(() => {
    if (!active) return;
    const theme = host.getHostContext?.()?.theme;
    if (theme) onTheme(theme);
    stopResize = host.setupSizeChangedNotifications?.();
  });
  return {
    connected,
    sendChoice: (id: number, ingredient: string) => host.sendMessage({ role: "user", content: [{ type: "text", text: `Choose product ${id} for ${ingredient} instead.` }] }),
    close: () => { active = false; stopResize?.(); host.ontoolresult = undefined; host.onhostcontextchanged = undefined; return host.close(); },
  };
};
