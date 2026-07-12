const baseUrl = (process.env.PRODUCTION_BASE_URL || "").replace(/\/$/, "");
const account = process.env.PRODUCTION_SMOKE_ACCOUNT || "";
const password = process.env.PRODUCTION_SMOKE_PASSWORD || "";

if (!baseUrl || !account || !password) {
  throw new Error("PRODUCTION_BASE_URL, PRODUCTION_SMOKE_ACCOUNT, and PRODUCTION_SMOKE_PASSWORD are required.");
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const homepage = await fetch(`${baseUrl}/`);
assert(homepage.status === 200, `Homepage returned ${homepage.status}`);

const anonymousMe = await jsonRequest("/api/auth/me");
assert(anonymousMe.response.status === 401, `Anonymous auth check returned ${anonymousMe.response.status}`);

const login = await jsonRequest("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ account, password })
});
assert(login.response.status === 200 && login.body.code === 0, `Login failed with ${login.response.status}`);
const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
assert(cookie, "Login did not return a session cookie.");
const authHeaders = { Cookie: cookie };

const [me, projects, workspaces, teamMaterials] = await Promise.all([
  jsonRequest("/api/auth/me", { headers: authHeaders }),
  jsonRequest("/api/projects", { headers: authHeaders }),
  jsonRequest("/api/workspaces", { headers: authHeaders }),
  jsonRequest("/api/materials?scope=team", { headers: authHeaders })
]);

assert(me.body.code === 0 && me.body.data?.account === account, "Authenticated user response is inconsistent.");
assert(projects.body.code === 0 && Array.isArray(projects.body.data), "Projects response is invalid.");
assert(workspaces.body.code === 0 && Array.isArray(workspaces.body.data), "Workspaces response is invalid.");
assert(teamMaterials.body.code === 0 && Array.isArray(teamMaterials.body.data), "Team materials response is invalid.");

const projectIds = new Set(projects.body.data.map(project => project.id));
const checkedProjects = [];
for (const workspace of workspaces.body.data) {
  assert(projectIds.has(workspace.projectId), `Workspace ${workspace.projectId} has no project.`);
  assert(Array.isArray(workspace.state?.shots), `Workspace ${workspace.projectId} shots are invalid.`);
  assert(Array.isArray(workspace.state?.tasks), `Workspace ${workspace.projectId} tasks are invalid.`);
  assert(Array.isArray(workspace.state?.assets), `Workspace ${workspace.projectId} assets are invalid.`);
}

for (const project of projects.body.data) {
  const [shots, materials, tasks] = await Promise.all([
    jsonRequest(`/api/shots?projectId=${project.id}`, { headers: authHeaders }),
    jsonRequest(`/api/materials?projectId=${project.id}`, { headers: authHeaders }),
    jsonRequest(`/api/video-tasks?project_id=${project.id}`, { headers: authHeaders })
  ]);
  assert(shots.body.code === 0 && Array.isArray(shots.body.data), `Shots failed for project ${project.id}.`);
  assert(materials.body.code === 0 && Array.isArray(materials.body.data), `Materials failed for project ${project.id}.`);
  assert(tasks.body.code === 0 && Array.isArray(tasks.body.data), `Tasks failed for project ${project.id}.`);
  const workspace = workspaces.body.data.find(item => item.projectId === project.id);
  assert(workspace, `Project ${project.id} has no workspace response.`);
  assert(workspace.state.shots.length === shots.body.data.length, `Shot count mismatch for project ${project.id}.`);
  assert(workspace.state.tasks.length === tasks.body.data.length, `Task count mismatch for project ${project.id}.`);
  const expectedMaterialCount = Number(workspace.state.project?.materialCount);
  assert(Number.isInteger(expectedMaterialCount), `Workspace ${project.id} has no material count.`);
  assert(expectedMaterialCount === materials.body.data.length, `Material count mismatch for project ${project.id}: workspace=${expectedMaterialCount}, api=${materials.body.data.length}.`);
  checkedProjects.push({ id: project.id, shots: shots.body.data.length, materials: materials.body.data.length, tasks: tasks.body.data.length });
}

const legacyRoute = await fetch(`${baseUrl}/api/assets`, { headers: authHeaders });
assert(legacyRoute.status === 404, `Legacy assets route returned ${legacyRoute.status}`);

console.log(JSON.stringify({
  ok: true,
  projects: projects.body.data.length,
  workspaces: workspaces.body.data.length,
  teamMaterials: teamMaterials.body.data.length,
  checkedProjects
}));
