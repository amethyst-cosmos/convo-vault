  function isVisibleElement(element) {
    const rect = element?.getBoundingClientRect?.();

    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
  }

  function isHiddenCaptureCandidate(element) {
    if (!element?.isConnected) {
      return true;
    }

    let current = element;
    const boundary = document.querySelector("main") || document.body;

    while (current && current !== document.documentElement) {
      if (current.hidden || current.getAttribute?.("aria-hidden") === "true" || current.hasAttribute?.("inert")) {
        return true;
      }

      const style = window.getComputedStyle?.(current);

      if (style && (style.display === "none" || style.visibility === "hidden")) {
        return true;
      }

      if (current === boundary || current === document.body) {
        break;
      }

      current = current.parentElement;
    }

    return false;
  }

  function isNodeInViewport(node) {
    const rect = node?.getBoundingClientRect?.();

    if (!rect) {
      return false;
    }

    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }

