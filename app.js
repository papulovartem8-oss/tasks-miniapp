const API_URL = '';

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

const DEMO_MODE = !tg;

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

let selectedDate = new Date();
let calendarOffset = 0;
let tasks = [];
let isSheetOpen = false;

// Elements
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const loading = document.getElementById('loading');
const headerDate = document.getElementById('headerDate');
const statsDone = document.getElementById('statsDone');
const statsTotal = document.getElementById('statsTotal');
const calendarStrip = document.getElementById('calendarStrip');
const calLeft = document.getElementById('calLeft');
const calRight = document.getElementById('calRight');
const fabBtn = document.getElementById('fabBtn');
const addSheet = document.getElementById('addSheet');
const sheetOverlay = document.getElementById('sheetOverlay');
const taskInput = document.getElementById('taskInput');
const sendBtn = document.getElementById('sendBtn');

// Init
renderCalendar();
loadTasks();

// Calendar navigation
calLeft.addEventListener('click', () => {
    calendarOffset -= 7;
    renderCalendar();
});

calRight.addEventListener('click', () => {
    calendarOffset += 7;
    renderCalendar();
});

// FAB & Sheet
fabBtn.addEventListener('click', () => {
    if (isSheetOpen) {
        closeSheet();
    } else {
        openSheet();
    }
});

sheetOverlay.addEventListener('click', closeSheet);

taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTask();
});

sendBtn.addEventListener('click', addTask);

// Functions

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDisplayDate(date) {
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function isToday(date) {
    const now = new Date();
    return date.getDate() === now.getDate()
        && date.getMonth() === now.getMonth()
        && date.getFullYear() === now.getFullYear();
}

function isSameDay(a, b) {
    return a.getDate() === b.getDate()
        && a.getMonth() === b.getMonth()
        && a.getFullYear() === b.getFullYear();
}

function renderCalendar() {
    calendarStrip.innerHTML = '';
    const today = new Date();
    const startDay = new Date(today);
    startDay.setDate(today.getDate() + calendarOffset - 3);

    for (let i = 0; i < 7; i++) {
        const date = new Date(startDay);
        date.setDate(startDay.getDate() + i);

        const el = document.createElement('div');
        el.className = 'cal-day';
        if (isSameDay(date, selectedDate)) el.classList.add('cal-day--active');
        if (isToday(date)) el.classList.add('cal-day--today');

        el.innerHTML = `
            <span class="cal-day__weekday">${WEEKDAYS[date.getDay()]}</span>
            <span class="cal-day__number">${date.getDate()}</span>
        `;

        const d = new Date(date);
        el.addEventListener('click', () => selectDate(d));
        calendarStrip.appendChild(el);
    }
}

function selectDate(date) {
    selectedDate = date;
    renderCalendar();
    headerDate.textContent = formatDisplayDate(date);

    taskList.classList.add('tasks--fading');
    setTimeout(() => {
        loadTasks();
        taskList.classList.remove('tasks--fading');
    }, 200);

    haptic('impact', 'light');
}

async function loadTasks() {
    const dateStr = formatDate(selectedDate);
    headerDate.textContent = formatDisplayDate(selectedDate);

    if (DEMO_MODE) {
        tasks = [];
        renderTasks();
        return;
    }

    showLoading(true);
    showEmpty(false);
    taskList.innerHTML = '';

    try {
        const data = await api('GET', `/api/tasks?date=${dateStr}`);
        tasks = data;
        renderTasks();
    } catch (e) {
        console.error('Failed to load tasks:', e);
        tasks = [];
        renderTasks();
    }

    showLoading(false);
}

function renderTasks() {
    taskList.innerHTML = '';
    updateStats();

    if (tasks.length === 0) {
        showEmpty(true);
        return;
    }

    showEmpty(false);

    const uncompleted = tasks.filter(t => !t.completed);
    const completed = tasks.filter(t => t.completed);
    const sorted = [...uncompleted, ...completed];

    sorted.forEach((task, i) => {
        const el = createTaskElement(task);
        el.style.animationDelay = `${i * 0.03}s`;
        taskList.appendChild(el);
    });
}

function createTaskElement(task) {
    const el = document.createElement('div');
    el.className = `task${task.completed ? ' task--done' : ''}`;
    el.dataset.id = task.id;

    el.innerHTML = `
        <div class="task__check">
            <svg class="task__checkmark" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <span class="task__text">${escapeHtml(task.text)}</span>
        <button class="task__delete" aria-label="Удалить">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
        </button>
    `;

    el.querySelector('.task__check').addEventListener('click', () => toggleTask(task, el));
    el.querySelector('.task__delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(task, el);
    });

    return el;
}

let demoIdCounter = 1;

async function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;

    taskInput.value = '';
    sendBtn.disabled = true;

    if (DEMO_MODE) {
        const task = { id: demoIdCounter++, text, date: formatDate(selectedDate), completed: false };
        tasks.push(task);
        showEmpty(false);
        const el = createTaskElement(task);
        taskList.appendChild(el);
        updateStats();
        haptic('notification', 'success');
        sendBtn.disabled = false;
        closeSheet();
        return;
    }

    try {
        const task = await api('POST', '/api/tasks', {
            text,
            date: formatDate(selectedDate)
        });
        tasks.push(task);
        showEmpty(false);

        const el = createTaskElement(task);
        taskList.appendChild(el);
        updateStats();
        haptic('notification', 'success');
    } catch (e) {
        console.error('Failed to add task:', e);
        taskInput.value = text;
    }

    sendBtn.disabled = false;
    closeSheet();
}

async function toggleTask(task, el) {
    task.completed = !task.completed;
    el.classList.toggle('task--done');
    el.classList.add('task--completing');
    setTimeout(() => el.classList.remove('task--completing'), 400);
    updateStats();

    haptic('impact', task.completed ? 'medium' : 'light');

    if (DEMO_MODE) return;

    try {
        await api('PATCH', `/api/tasks/${task.id}`, { completed: task.completed });
    } catch (e) {
        task.completed = !task.completed;
        el.classList.toggle('task--done');
        updateStats();
    }
}

async function deleteTask(task, el) {
    el.classList.add('task--removing');
    haptic('impact', 'light');

    setTimeout(async () => {
        el.remove();
        tasks = tasks.filter(t => t.id !== task.id);
        updateStats();
        if (tasks.length === 0) showEmpty(true);

        if (DEMO_MODE) return;

        try {
            await api('DELETE', `/api/tasks/${task.id}`);
        } catch (e) {
            console.error('Failed to delete task:', e);
            tasks.push(task);
            renderTasks();
        }
    }, 350);
}

function updateStats() {
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    animateNumber(statsDone, done);
    animateNumber(statsTotal, total);
}

function animateNumber(el, target) {
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    el.style.transition = 'transform 0.2s, opacity 0.2s';
    el.style.transform = 'translateY(-8px)';
    el.style.opacity = '0';
    setTimeout(() => {
        el.textContent = target;
        el.style.transform = 'translateY(8px)';
        setTimeout(() => {
            el.style.transform = 'translateY(0)';
            el.style.opacity = '1';
        }, 30);
    }, 150);
}

function openSheet() {
    isSheetOpen = true;
    addSheet.classList.add('sheet--open');
    fabBtn.classList.add('fab--open');
    setTimeout(() => taskInput.focus(), 350);
    haptic('impact', 'light');
}

function closeSheet() {
    isSheetOpen = false;
    addSheet.classList.remove('sheet--open');
    fabBtn.classList.remove('fab--open');
    taskInput.blur();
}

function showEmpty(visible) {
    emptyState.classList.toggle('empty--visible', visible);
}

function showLoading(visible) {
    loading.classList.toggle('loading--visible', visible);
}

function haptic(type, style) {
    try {
        if (type === 'impact') {
            tg.HapticFeedback.impactOccurred(style);
        } else if (type === 'notification') {
            tg.HapticFeedback.notificationOccurred(style);
        }
    } catch (_) {}
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function api(method, path, body = null) {
    const url = API_URL + path;
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': tg?.initData || ''
        }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) {
        throw new Error(`API ${res.status}`);
    }
    return res.json();
}
