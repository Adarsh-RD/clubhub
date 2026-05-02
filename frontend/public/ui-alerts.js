window.customAlert = function (message) {
  return new Promise((resolve) => {
    createDialog(message, false, resolve);
  });
};

window.customConfirm = function (message) {
  return new Promise((resolve) => {
    createDialog(message, true, resolve);
  });
};

function createDialog(message, isConfirm, resolve) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  overlay.style.backdropFilter = "blur(10px)";
  overlay.style.zIndex = "999999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.opacity = "0";
  overlay.style.transition = "opacity 0.3s ease";

  const box = document.createElement("div");
  box.style.background = "rgba(20, 20, 30, 0.95)";
  box.style.border = "1px solid rgba(255,255,255,0.1)";
  box.style.borderRadius = "1.5rem";
  box.style.padding = "2rem";
  box.style.maxWidth = "400px";
  box.style.width = "90%";
  box.style.boxShadow = "0 10px 40px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(225,29,72,0.2)";
  box.style.textAlign = "center";
  box.style.transform = "translateY(20px) scale(0.95)";
  box.style.transition = "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
  box.style.color = "#fff";
  box.style.fontFamily = "\"Inter\", -apple-system, sans-serif";

  const icon = document.createElement("div");
  const msgLower = message.toLowerCase();
  const isSuccess = msgLower.includes("success") || msgLower.includes("complete") || msgLower.includes("copied");
  const isError = msgLower.includes("fail") || msgLower.includes("error") || msgLower.includes("denied") || msgLower.includes("large");
  
  // Default is Info (Blue 'i')
  let svg = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  
  if (isSuccess) {
    svg = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (isError) {
    svg = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else if (isConfirm) {
    // Question mark
    svg = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  }
  
  icon.innerHTML = svg;
  icon.style.marginBottom = "1.5rem";

  const text = document.createElement("p");
  // Remove possible mangled characters or emojis from previous bad encoding
  text.innerText = message.replace(/^[✓✗⚠️?]\s*/, "");
  text.style.fontSize = "1.0625rem";
  text.style.lineHeight = "1.5";
  text.style.marginBottom = "2rem";
  text.style.fontWeight = "500";

  const btnContainer = document.createElement("div");
  btnContainer.style.display = "flex";
  btnContainer.style.gap = "1rem";
  btnContainer.style.justifyContent = "center";

  const btnStyle = "padding: 0.75rem 1.5rem; border-radius: 0.75rem; font-weight: 600; font-size: 0.9375rem; cursor: pointer; transition: all 0.2s ease; border: none; flex: 1;";

  if (isConfirm) {
    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Cancel";
    cancelBtn.style.cssText = btnStyle + "background: rgba(255,255,255,0.05); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.1);";
    cancelBtn.onmouseover = () => cancelBtn.style.background = "rgba(255,255,255,0.1)";
    cancelBtn.onmouseout = () => cancelBtn.style.background = "rgba(255,255,255,0.05)";
    cancelBtn.onclick = () => close(false);
    btnContainer.appendChild(cancelBtn);
  }

  const okBtn = document.createElement("button");
  okBtn.innerText = isConfirm ? "Yes, I am sure" : "Okay";
  
  // Set button colors based on type
  let okColor = "#3B82F6";
  let okColorDark = "#2563EB";
  if (isSuccess) {
    okColor = "#10B981"; okColorDark = "#059669";
  } else if (isError) {
    okColor = "#EF4444"; okColorDark = "#DC2626";
  } else if (isConfirm) {
    okColor = "#E11D48"; okColorDark = "#BE123C";
  }
  
  okBtn.style.cssText = btnStyle + `background: linear-gradient(135deg, ${okColor} 0%, ${okColorDark} 100%); color: white; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);`;
  okBtn.onmouseover = () => okBtn.style.transform = "translateY(-2px)";
  okBtn.onmouseout = () => okBtn.style.transform = "translateY(0)";
  okBtn.onclick = () => close(true);
  btnContainer.appendChild(okBtn);

  box.appendChild(icon);
  box.appendChild(text);
  box.appendChild(btnContainer);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    box.style.transform = "translateY(0) scale(1)";
  });

  function close(result) {
    overlay.style.opacity = "0";
    box.style.transform = "translateY(20px) scale(0.95)";
    setTimeout(() => {
      document.body.removeChild(overlay);
      resolve(result);
    }, 300);
  }
}

// Override globally for all normal calls
window.originalAlert = window.alert;
window.originalConfirm = window.confirm;
window.alert = function(msg) { window.customAlert(msg); };

