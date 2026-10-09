import "@testing-library/jest-dom/vitest";

/**
 * jsdom does not implement the native `<dialog>` methods that `Modal` relies on
 * — its `HTMLDialogElement` is a stub with no `showModal`/`close` — so rendering
 * a dialog in a test would throw "showModal is not a function".
 *
 * This supplies the minimum behaviour needed: toggle the `open` attribute and
 * dispatch the `close` event React listens for.
 */
if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype;

  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal(this: HTMLDialogElement): void {
      this.setAttribute("open", "");
    };

    proto.close = function close(
      this: HTMLDialogElement,
      returnValue?: string,
    ): void {
      this.removeAttribute("open");
      if (returnValue !== undefined) {
        this.returnValue = returnValue;
      }
      this.dispatchEvent(new Event("close"));
    };
  }
}

export {};
