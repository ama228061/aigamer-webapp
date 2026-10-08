const crops = [
  {
    category: "grain",
    label: "Зерновые",
    name: "Пшеница",
    subtitle: "Основа хорошего урожая",
    image: "assets/assets/images/p1.jpg",
    description:
      "Пшеница — основная зерновая культура, выращиваемая для производства муки.",
    care: "Выбирайте сроки и глубину посева с учётом сорта, климата и влажности почвы. Следите за состоянием посевов, вовремя проводите подкормки и защищайте растения от вредителей.",
  },
  {
    category: "grain",
    label: "Уход за посевами",
    name: "Посадки",
    subtitle: "Внимание к каждому этапу",
    image: "assets/assets/images/p8.jpg",
    description:
      "Рост растений зависит от почвы, освещения и правильного ухода. Регулярное наблюдение помогает вовремя заметить изменения.",
    care: "Поддерживайте почву рыхлой, удаляйте сорняки, следите за влажностью. Поливайте утром или вечером, избегая застоя воды. Схему подкормок подбирайте по потребностям культуры.",
  },
  {
    category: "fruit",
    label: "Плодовые деревья",
    name: "Яблоня",
    subtitle: "От цветения до спелых плодов",
    image: "assets/assets/frutis/apple.jpg",
    description:
      "Яблоки — сочные, ароматные плоды, которые подходят для свежего употребления и переработки.",
    care: "Выберите солнечное место с плодородной, хорошо дренированной почвой. Не заглубляйте корневую шейку при посадке. Молодому дереву нужен регулярный полив, мульчирование и весенняя санитарная обрезка.",
  },
  {
    category: "grain",
    label: "Зерновые",
    name: "Урожай",
    subtitle: "Результат заботы и труда",
    image: "assets/assets/images/p5.jpg",
    description:
      "Созревание — завершающий этап перед сбором урожая. В этот период важно оценивать состояние растений и готовность зерна.",
    care: "Наблюдайте за влажностью почвы и признаками созревания. Сроки уборки зависят от культуры, сорта и погоды. Заранее подготовьте условия для хранения урожая.",
  },
  {
    category: "fruit",
    label: "Плодовые деревья",
    name: "Груша Дюшес",
    subtitle: "Сладкий вкус вашего сада",
    image: "assets/assets/frutis/dushes.jpg",
    description:
      "Дюшес — ароматная груша с приятным сладким вкусом. Её плоды подходят для свежего употребления и консервирования.",
    care: "Груша предпочитает тёплые, солнечные места, защищённые от ветра. Избегайте низин с застоем воды. Весной проводите санитарную обрезку, в сухую погоду обеспечивайте полив и мульчируйте приствольный круг.",
  },
  {
    category: "grain",
    label: "Устойчивое земледелие",
    name: "Здоровая почва",
    subtitle: "Забота о будущем земли",
    image: "assets/assets/images/p7.jpg",
    description:
      "Здоровье почвы — основа устойчивого земледелия. Её структура, плодородие и влажность определяют развитие растений.",
    care: "Чередуйте культуры, сохраняйте органическое вещество и избегайте уплотнения почвы. Перед внесением удобрений учитывайте анализ почвы и потребности растений.",
  },
];
const grid = document.querySelector("#crop-grid");
const cropDialog = document.querySelector("#crop-dialog");
let selectedCrop;
function renderCrops(filter = "all") {
  grid.replaceChildren();
  for (const crop of crops.filter(
    (c) => filter === "all" || c.category === filter,
  )) {
    const button = document.createElement("button");
    button.className = "crop-card";
    button.setAttribute("aria-label", `Открыть карточку: ${crop.name}`);
    button.innerHTML = `<div class="crop-card-photo"><img src="${crop.image}" alt="${crop.name}" loading="lazy"><span class="crop-tag">${crop.label}</span></div><div class="crop-card-info"><div><h3>${crop.name}</h3><p>${crop.subtitle}</p></div><span aria-hidden="true"><svg><use href="#i-arrow"/></svg></span></div>`;
    button.addEventListener("click", () => {
      selectedCrop = crop;
      document.querySelector("#crop-title").textContent = crop.name;
      document.querySelector("#crop-description").textContent =
        crop.description;
      document.querySelector("#crop-care").textContent = crop.care;
      document.querySelector("#crop-category").textContent = crop.label;
      const image = document.querySelector("#crop-image");
      image.src = crop.image;
      image.alt = crop.name;
      cropDialog.showModal();
    });
    grid.append(button);
  }
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
renderCrops();
document
  .querySelectorAll("[data-filter]")
  .forEach((b) =>
    b.addEventListener("click", () => renderCrops(b.dataset.filter)),
  );
document
  .querySelectorAll("[data-service-filter]")
  .forEach((b) =>
    b.addEventListener("click", () => renderCrops(b.dataset.serviceFilter)),
  );
document
  .querySelector(".crop-close")
  .addEventListener("click", () => cropDialog.close());
document.querySelector("#year").textContent = new Date().getFullYear();
const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector("#navigation");
function closeMenu() {
  nav.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Открыть меню");
}
menuButton.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
});
nav.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    closeMenu();
    nav
      .querySelectorAll("a")
      .forEach((link) => link.classList.toggle("active", link === a));
  }),
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && nav.classList.contains("open")) {
    closeMenu();
    menuButton.focus();
  }
});
const chat = document.querySelector("#chat");
const input = document.querySelector("#chat-input");
const messages = document.querySelector("#chat-messages");
const sendButton = document.querySelector("#send-chat");
const errorBox = document.querySelector("#chat-error");
const retryButton = document.querySelector("#retry-chat");
const history = [];
let sending = false;
let retryPending = false;
function openChat() {
  if (!chat.open) chat.showModal();
  input.focus();
}
document
  .querySelectorAll("[data-open-chat]")
  .forEach((b) => b.addEventListener("click", openChat));
document
  .querySelector("[data-close-chat]")
  .addEventListener("click", () => chat.close());
document.querySelector("#crop-chat").addEventListener("click", () => {
  cropDialog.close();
  openChat();
  input.value = `Расскажите подробнее о посадке и уходе: ${selectedCrop.name}.`;
  resizeInput();
});
function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 105)}px`;
}
input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!sending) document.querySelector("#chat-form").requestSubmit();
  }
});
function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
  if (role !== "user") {
    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = "АгроПомощник";
    wrapper.append(label);
  }
  const body = document.createElement("p");
  body.textContent = text;
  wrapper.append(body);
  messages.append(wrapper);
  messages.scrollTop = messages.scrollHeight;
}
const errors = {
  not_configured:
    "Помощник пока не подключён. Напишите нам в Telegram — мы поможем с вашим вопросом.",
  model_not_found:
    "Помощник временно недоступен. Попробуйте позже или свяжитесь с нами в Telegram.",
  provider_auth:
    "Помощник временно недоступен. Попробуйте позже или свяжитесь с нами в Telegram.",
  rate_limited:
    "Сейчас много запросов. Подождите немного и попробуйте ещё раз.",
  timeout: "Ответ занимает больше времени, чем обычно. Попробуйте ещё раз.",
  invalid_request:
    "Проверьте вопрос: он должен содержать от 1 до 2000 символов.",
};
async function sendQuestion(retry = false) {
  if (sending) return;
  const question = input.value.trim();
  if (!retry && !question) return;
  if (!retry) {
    if (retryPending) history.pop();
    history.push({ role: "user", text: question });
    appendMessage("user", question);
    input.value = "";
    resizeInput();
    document.querySelector(".chat-suggestions")?.remove();
  }
  sending = true;
  retryPending = false;
  errorBox.hidden = true;
  sendButton.disabled = true;
  retryButton.disabled = true;
  input.disabled = true;
  const typing = document.createElement("div");
  typing.className = "typing";
  typing.innerHTML = "<i></i><i></i><i></i><span>Подбираю ответ…</span>";
  messages.append(typing);
  messages.scrollTop = messages.scrollHeight;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  const started = performance.now();
  let diagnostic = { status: "error", model: null, usage: null };
  try {
    const endpoint =
      window.AGRO_CONFIG?.chatEndpoint ||
      new URL("api/chat", document.baseURI).href;
    if (
      !window.AGRO_CONFIG?.chatEndpoint &&
      location.hostname.endsWith(".github.io")
    )
      throw new Error("not_configured");
    let context = history.slice(-5);
    if (context[0]?.role !== "user") context = context.slice(1);
    while (
      context.length > 1 &&
      new TextEncoder().encode(JSON.stringify({ messages: context })).length >
        12000
    )
      context = context.slice(2);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: context }),
      signal: controller.signal,
      credentials: "omit",
    });
    const data = await response.json().catch(() => ({
      error:
        response.status === 404 ? "not_configured" : "upstream_unavailable",
    }));
    diagnostic.model = data.model;
    diagnostic.usage = data.usage;
    if (!response.ok || typeof data.reply !== "string" || !data.reply.trim())
      throw new Error(data.error || "upstream_unavailable");
    history.push({ role: "model", text: data.reply });
    appendMessage("model", data.reply);
    diagnostic.status = "ok";
  } catch (error) {
    retryPending = true;
    errorBox.querySelector("p").textContent =
      errors[error.name === "AbortError" ? "timeout" : error.message] ||
      "Не удалось получить ответ. Проверьте соединение и попробуйте ещё раз.";
    errorBox.hidden = false;
  } finally {
    window.AGRO_DEBUG?.recordRequest({
      ...diagnostic,
      durationMs: Math.round(performance.now() - started),
    });
    clearTimeout(timeout);
    typing.remove();
    sending = false;
    sendButton.disabled = false;
    retryButton.disabled = false;
    input.disabled = false;
    if (chat.open) input.focus();
    messages.scrollTop = messages.scrollHeight;
  }
}
document.querySelector("#chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  sendQuestion();
});
retryButton.addEventListener("click", () => {
  if (retryPending) sendQuestion(true);
});
document.querySelectorAll("[data-question]").forEach((b) =>
  b.addEventListener("click", () => {
    input.value = b.dataset.question;
    sendQuestion();
  }),
);
// Remove only registrations and caches belonging to the old Flutter version.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      for (const registration of registrations) {
        const worker =
          registration.active ||
          registration.waiting ||
          registration.installing;
        if (
          worker &&
          new URL(worker.scriptURL).pathname.endsWith(
            "/flutter_service_worker.js",
          )
        )
          await registration.unregister();
      }
      if ("caches" in window)
        await Promise.all(
          [
            "flutter-app-cache",
            "flutter-temp-cache",
            "flutter-app-manifest",
          ].map((name) => caches.delete(name)),
        );
    })
    .catch(() => {});
}
