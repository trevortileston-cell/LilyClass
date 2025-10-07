const modules = [
  {
    title: "Friendly Introductions",
    objective: "Learn how to start conversations with new classmates or neighbors.",
    focus: [
      "Practice using a warm greeting and eye contact",
      "Share one detail about yourself and ask a question",
      "Wrap up with a friendly closing so the chat feels complete"
    ],
    realWorld: "Before dinner, introduce yourself to someone new (a neighbor, teammate, or club member)."
  },
  {
    title: "Teamwork Builder",
    objective: "Work on taking turns and showing teamwork during group activities.",
    focus: [
      "Use inclusive language so everyone feels welcome",
      "Offer a suggestion and invite others to share theirs",
      "Listen carefully and repeat back one idea you heard"
    ],
    realWorld: "During your next group project or game, try asking everyone what job they want before you start."
  },
  {
    title: "Handling Tough Moments",
    objective: "Practice calming strategies and respectful words during conflicts.",
    focus: [
      "Pause and check in with your body before responding",
      "Use 'I feel' statements to explain your point",
      "Work together to find a solution everyone can accept"
    ],
    realWorld: "If a disagreement happens this week, take a deep breath and use an 'I feel' sentence before responding."
  }
];

const scenarios = [
  {
    id: "greeting",
    title: "Greet a new classmate",
    location: "School hallway before class",
    skill: "Starting conversations",
    coachTip: "Smile, say hello, and use the person's name if you know it.",
    steps: [
      "Take a calming breath and notice something positive about the person",
      "Say hello and share something about yourself",
      "Ask a friendly question to learn about them"
    ],
    prompts: [
      {
        coach: "You notice a new student at their locker. What could you say first?",
        options: [
          {
            text: "Hi! I'm Jamie. I like your backpack. Want help finding your next class?",
            isCorrect: true,
            feedback: "That greeting is specific and kind. You introduced yourself and offered support!"
          },
          {
            text: "Hey, you look lost. What's your deal?",
            isCorrect: false,
            feedback: "This might sound unfriendly. Try using positive words and offering help."
          }
        ]
      },
      {
        coach: "They smile and say, 'Yes please! It's my first day.' What do you say next?",
        options: [
          {
            text: "No problem! I'm heading to science. What class do you have?",
            isCorrect: true,
            feedback: "Great follow-up! You're showing interest and keeping the conversation going."
          },
          {
            text: "Cool. I have to go now, bye.",
            isCorrect: false,
            feedback: "Leaving right away ends the conversation. Try asking a question or offering more help."
          }
        ]
      }
    ],
    nextStep:
      "Try this in the hallway tomorrow morning. Report back in your journal on how the conversation went!"
  },
  {
    id: "lunch",
    title: "Join a lunch table",
    location: "School cafeteria",
    skill: "Joining groups politely",
    coachTip: "Check the group's body language before joining and ask with a friendly tone.",
    steps: [
      "Walk up with a smile and notice what they are talking about",
      "Ask if you can join and offer to share something",
      "Contribute to the conversation and show appreciation"
    ],
    prompts: [
      {
        coach: "You see a group from art club. What's a polite way to ask to sit with them?",
        options: [
          {
            text: "Hi everyone! Is anyone sitting here? I brought the markers we used yesterday.",
            isCorrect: true,
            feedback: "Excellent! You used a friendly greeting and mentioned something you share."
          },
          {
            text: "This seat's mine now. Move over.",
            isCorrect: false,
            feedback: "This sounds demanding. Asking first shows respect for the group."
          }
        ]
      },
      {
        coach: "They make space for you. How can you keep the chat going?",
        options: [
          {
            text: "Thanks! What project are you working on for the art show?",
            isCorrect: true,
            feedback: "Curious questions invite others to share more. Nice job!"
          },
          {
            text: "Finally, somewhere to sit. I'm starving.",
            isCorrect: false,
            feedback: "This statement doesn't connect with others. Try showing interest in them."
          }
        ]
      }
    ],
    nextStep: "During lunch this week, ask a group if you can join them and share one kind comment."
  },
  {
    id: "conflict",
    title: "Solve a playground problem",
    location: "Playground during recess",
    skill: "Resolving conflicts",
    coachTip: "Slow down, listen to both sides, and offer a fair suggestion.",
    steps: [
      "Check in with everyone's feelings",
      "Repeat the problem to be sure you understand",
      "Suggest a plan that includes each person"
    ],
    prompts: [
      {
        coach: "Two friends want the same swing. What's a helpful first response?",
        options: [
          {
            text: "Looks like this is important to both of you. Let's take turns so it's fair.",
            isCorrect: true,
            feedback: "You noticed their feelings and suggested sharing. Way to be a problem solver!"
          },
          {
            text: "Whoever gets there first wins. Too bad!",
            isCorrect: false,
            feedback: "This doesn't help the friends work together. Try offering a solution that feels fair."
          }
        ]
      },
      {
        coach: "They agree to take turns. How can you wrap it up?",
        options: [
          {
            text: "Great! I'll set a timer for three minutes each so it's even.",
            isCorrect: true,
            feedback: "Awesome! You added a clear plan so everyone knows what happens next."
          },
          {
            text: "Okay, I'm leaving now. Figure it out yourselves.",
            isCorrect: false,
            feedback: "Walking away now could bring the conflict back. Try helping them follow the plan."
          }
        ]
      }
    ],
    nextStep: "On the playground, try suggesting a take-turns plan the next time there's a disagreement."
  }
];

const dailyMissions = [
  "Give a sincere compliment to someone who helped you today.",
  "Ask a family member about their day and listen without interrupting.",
  "Invite a classmate who is alone to join your group activity.",
  "Share a toy or supply with a friend and notice their reaction.",
  "Practice introducing yourself to an adult helper, like a librarian or coach."
];

const missionChecklistItems = [
  "Introduced myself to someone new",
  "Invited someone to join in",
  "Used an 'I feel' statement",
  "Helped solve a small disagreement",
  "Shared something that made another person smile"
];

const safeStorage = (() => {
  try {
    const key = "skills-coach-check";
    localStorage.setItem(key, "ok");
    localStorage.removeItem(key);
    return localStorage;
  } catch (error) {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
  }
})();

let conversationBadges = Number(safeStorage.getItem("conversationBadges") || 0);
let missionChecklistState = JSON.parse(safeStorage.getItem("missionChecklistState") || "{}");
let missionHistory = JSON.parse(safeStorage.getItem("missionHistory") || "[]");
let reflections = JSON.parse(safeStorage.getItem("reflections") || "[]");

const moduleGrid = document.querySelector("#moduleGrid");
const scenarioSelect = document.querySelector("#scenarioSelect");
const scenarioDetails = document.querySelector("#scenarioDetails");
const conversationCount = document.querySelector("#conversationCount");
const missionCount = document.querySelector("#missionCount");
const missionChecklist = document.querySelector("#missionChecklist");
const dailyMissionBtn = document.querySelector("#dailyMissionBtn");
const dailyMission = document.querySelector("#dailyMission");
const reflectionInput = document.querySelector("#reflectionInput");
const saveReflectionBtn = document.querySelector("#saveReflection");
const reflectionList = document.querySelector("#reflectionList");
const saveStatus = document.querySelector("#saveStatus");

function renderModules() {
  moduleGrid.innerHTML = modules
    .map((module) => {
      const focusItems = module.focus
        .map((item) => `<li>${item}</li>`)
        .join("");
      return `
        <article class="module-card" role="listitem">
          <h3>${module.title}</h3>
          <p>${module.objective}</p>
          <ul>${focusItems}</ul>
          <p class="real-world">Real world mission: ${module.realWorld}</p>
        </article>
      `;
    })
    .join("");
}

function populateScenarioSelect() {
  scenarioSelect.innerHTML = scenarios
    .map(
      (scenario, index) =>
        `<option value="${scenario.id}" ${index === 0 ? "selected" : ""}>${scenario.title}</option>`
    )
    .join("");
}

function renderScenarioDetails(scenario) {
  const stepsList = scenario.steps.map((step) => `<li>${step}</li>`).join("");
  const promptsMarkup = scenario.prompts
    .map(
      (prompt, promptIndex) => `
      <div class="prompt" data-prompt-index="${promptIndex}">
        <h4>Coach says:</h4>
        <p>${prompt.coach}</p>
        <div class="options">
          ${prompt.options
            .map(
              (option, optionIndex) => `
              <button class="option-btn" data-option-index="${optionIndex}" data-correct="${option.isCorrect}">
                ${option.text}
              </button>
            `
            )
            .join("")}
        </div>
        <p class="feedback" hidden></p>
      </div>
    `
    )
    .join("");

  scenarioDetails.innerHTML = `
    <div class="scenario-meta">
      <span><strong>Where:</strong> ${scenario.location}</span>
      <span><strong>Skill focus:</strong> ${scenario.skill}</span>
    </div>
    <div class="coach-tip">Coach tip: ${scenario.coachTip}</div>
    <div>
      <h3>Steps to try in real life</h3>
      <ol>${stepsList}</ol>
    </div>
    <div>
      <h3>Practice conversation</h3>
      ${promptsMarkup}
    </div>
    <div class="next-step">Next real world step: ${scenario.nextStep}</div>
  `;

  scenarioDetails.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", handleOptionClick);
  });
}

function handleOptionClick(event) {
  const button = event.currentTarget;
  const isCorrect = button.dataset.correct === "true";
  const promptEl = button.closest(".prompt");
  const feedbackEl = promptEl.querySelector(".feedback");

  promptEl.querySelectorAll(".option-btn").forEach((btn) => {
    btn.disabled = true;
    btn.classList.remove("correct", "incorrect");
  });

  button.classList.add(isCorrect ? "correct" : "incorrect");
  feedbackEl.textContent = getFeedback(promptEl, Number(button.dataset.optionIndex));
  feedbackEl.hidden = false;

  if (isCorrect) {
    addConversationBadge();
  }
}

function getFeedback(promptEl, index) {
  const promptIndex = Number(promptEl.dataset.promptIndex);
  const scenario = scenarios.find((item) => item.id === scenarioSelect.value);
  return scenario.prompts[promptIndex].options[index].feedback;
}

function addConversationBadge() {
  conversationBadges += 1;
  safeStorage.setItem("conversationBadges", conversationBadges);
  updateProgress();
}

function updateProgress() {
  conversationCount.textContent = conversationBadges;
  missionCount.textContent = countRecentMissions();
}

function countRecentMissions() {
  const now = new Date();
  missionHistory = missionHistory.filter((dateString) => {
    const date = new Date(dateString);
    const diff = (now - date) / (1000 * 60 * 60 * 24);
    return diff <= 6;
  });
  safeStorage.setItem("missionHistory", JSON.stringify(missionHistory));
  return missionHistory.length;
}

function renderMissionChecklist() {
  missionChecklist.innerHTML = missionChecklistItems
    .map((item) => {
      const id = item.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const checked = missionChecklistState[id];
      return `
        <label class="mission-item">
          <input type="checkbox" id="${id}" ${checked ? "checked" : ""} />
          <span>${item}</span>
        </label>
      `;
    })
    .join("");

  missionChecklist.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      missionChecklistState[event.target.id] = event.target.checked;
      safeStorage.setItem("missionChecklistState", JSON.stringify(missionChecklistState));
    });
  });
}

function showDailyMission() {
  const mission = dailyMissions[Math.floor(Math.random() * dailyMissions.length)];
  dailyMission.textContent = mission;
}

function saveReflection() {
  const text = reflectionInput.value.trim();
  if (!text) {
    saveStatus.textContent = "Write a few words before saving.";
    setTimeout(() => (saveStatus.textContent = ""), 1800);
    return;
  }

  const entry = {
    text,
    date: new Date().toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  };

  reflections.unshift(entry);
  safeStorage.setItem("reflections", JSON.stringify(reflections));
  reflectionInput.value = "";
  saveStatus.textContent = "Reflection saved!";
  setTimeout(() => (saveStatus.textContent = ""), 2000);
  renderReflections();
}

function renderReflections() {
  if (!reflections.length) {
    reflectionList.innerHTML =
      "<li class=\"reflection-card\">No reflections yet. Try completing a mission!</li>";
    return;
  }

  reflectionList.innerHTML = reflections
    .map(
      (entry) => `
      <li class="reflection-card">
        <div class="reflection-date">${entry.date}</div>
        <div>${entry.text}</div>
      </li>
    `
    )
    .join("");
}

function init() {
  renderModules();
  populateScenarioSelect();
  renderScenarioDetails(scenarios[0]);
  renderMissionChecklist();
  renderReflections();
  updateProgress();
}

scenarioSelect.addEventListener("change", (event) => {
  const scenario = scenarios.find((item) => item.id === event.target.value);
  if (scenario) {
    renderScenarioDetails(scenario);
  }
});

dailyMissionBtn.addEventListener("click", () => {
  showDailyMission();
  addMissionCompletion();
});

function addMissionCompletion() {
  const todayKey = new Date().toISOString().slice(0, 10);
  if (!missionHistory.includes(todayKey)) {
    const now = new Date();
    missionHistory = missionHistory.filter((dateString) => {
      const date = new Date(dateString);
      const diff = (now - date) / (1000 * 60 * 60 * 24);
      return diff <= 6;
    });
    missionHistory.push(todayKey);
    safeStorage.setItem("missionHistory", JSON.stringify(missionHistory));
    updateProgress();
  }
}

saveReflectionBtn.addEventListener("click", saveReflection);

init();
