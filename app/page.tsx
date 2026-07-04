"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type ShotStatus = "pending" | "running" | "done" | "failed";
type TaskStatus = "pending" | "running" | "done" | "failed";
type MaterialKind = "image" | "video" | "audio" | "sd2";
type MaterialRole = "reference_image" | "first_frame" | "last_frame" | "reference_video" | "reference_audio";
type ImageQuality = "auto" | "high" | "medium" | "low";
type AspectRatio = "1:1" | "3:2" | "2:3" | "4:3" | "3:4" | "16:9" | "9:16" | "auto";
type LibraryFilter = "all" | "text" | "image" | "video";

type Project = { id: number; name: string; type: string; script: string };
type Shot = { id: number; title: string; prompt: string; ratio: string; duration: number; status: ShotStatus; resolution?: "480p" | "720p" | "1080p"; width?: number; height?: number };
type VideoTask = { id: string; shotId: number; shotTitle: string; provider: string; status: TaskStatus; result: string; providerTaskId?: string };
type VideoAsset = { id: number; shotId: number; title: string; meta: string; gradient: string; videoUrl?: string; providerTaskId?: string };
type MaterialAsset = { id: number; name: string; url: string; kind: MaterialKind; role: MaterialRole; previewUrl?: string; seedanceAssetUrl?: string; reviewedAssetUrl?: string };
type AppState = { project: Project; shots: Shot[]; tasks: VideoTask[]; assets: VideoAsset[]; materials: MaterialAsset[]; assetGroupId?: string | number };
type ProjectStates = Record<number, AppState>;
type AuthUser = {
  id: string;
  account: string;
  role: MemberRole;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
  displayName?: string;
  email?: string;
  phone?: string;
  language?: string;
  apiKeys?: { id: string; name: string; value: string; createdAt: number }[];
};
type AuthUsers = Record<string, AuthUser>;
type MemberRole = "super_admin" | "tenant_admin" | "user";
type ProfileSection = "basic" | "security" | "api";
type WorkspaceSection = "project-home" | "overview" | "script" | "shots" | "image-workbench" | "material-assets" | "tasks" | "generated-videos" | "assets" | "members" | "channel-management" | "profile";
type ApiProfile = { id: string; name: string; baseUrl: string; apiKey?: string; model?: string; videoModels: string[]; imageModels: string[]; concurrencyLimit?: number; active: boolean; createdAt: number; hasApiKey?: boolean };
type VisualAsset = {
  id: string;
  asset_url: string;
  asset_name: string;
  类型: string;
  同步状态: string;
  失败原因: string;
  资产状态: string;
  所属组: string;
  group_id: string;
  创建时间: string;
  操作: string[];
  原始URL: string;
};

const STORAGE_KEY = "manjing-video-mvp";
const AUTH_STORAGE_KEY = "manjing-video-auth";
const USER_STORAGE_KEY = "manjing-video-users";
const API_PROFILE_STORAGE_KEY = "manjing-video-api-profiles";
const ACTIVE_API_PROFILE_STORAGE_KEY = "manjing-video-active-api-profile";
const DEFAULT_ASSET_GROUP_ID = "181862014778343444";
const defaultApiProfiles: ApiProfile[] = [];

const seedState: AppState = {
  project: { id: 1, name: "短剧团队 Demo", type: "都市短剧", script: "女主带着关键合同来到男主公司，两人在会议室正面对峙，揭开三年前误会的真相。" },
  shots: [
    { id: 1, title: "女主入场", prompt: "女主推门进入办公室，灯光偏冷，镜头缓慢推进。", ratio: "9:16 竖屏短剧", duration: 5, status: "pending" },
    { id: 2, title: "男主反应", prompt: "男主抬头看向门口，表情从惊讶转为克制。", ratio: "9:16 竖屏短剧", duration: 4, status: "pending" }
  ],
  tasks: [],
  assets: [],
  materials: []
};

const demo2State: AppState = {
  project: { id: 2, name: "demo2", type: "测试项目", script: "用于保留第二个演示项目，可切换后继续添加剧本、视频和素材。" },
  shots: [],
  tasks: [],
  assets: [],
  materials: []
};

const defaultProjectStates: ProjectStates = {
  [seedState.project.id]: seedState,
  [demo2State.project.id]: demo2State
};

const defaultProjects = [seedState.project, demo2State.project];

function normalizeAppState(value: Partial<AppState> | undefined, fallback: AppState = seedState): AppState {
  return {
    project: {
      id: value?.project?.id || fallback.project.id,
      name: value?.project?.name || fallback.project.name,
      type: value?.project?.type || fallback.project.type,
      script: value?.project?.script || ""
    },
    shots: Array.isArray(value?.shots) ? value.shots : [],
    tasks: Array.isArray(value?.tasks) ? value.tasks : [],
    assets: Array.isArray(value?.assets) ? value.assets : [],
    materials: Array.isArray(value?.materials) ? value.materials : [],
    assetGroupId: value?.assetGroupId
  };
}

function proxiedVideoUrl(url?: string, download = false, taskId?: string, profile?: ApiProfile) {
  if (!url && !taskId) return "";
  const params = new URLSearchParams();
  if (url) params.set("url", url);
  if (taskId) params.set("task_id", taskId);
  if (profile?.id) params.set("profile_id", profile.id);
  if (download) params.set("download", "1");
  return `/api/video-files?${params.toString()}`;
}

  function taskStatusTag(status: TaskStatus) {
  const map = { pending: ["pending", "等待生成"], running: ["running", "生成中"], done: ["done", "完成"], failed: ["pending", "失败"] } as const;
  const [className, text] = map[status];
  return <span className={`tag ${className}`}>{text}</span>;
}

function randomGradient() {
  const gradients = ["linear-gradient(135deg,#14213d,#0f9f7a)", "linear-gradient(135deg,#312e81,#0ea5e9)", "linear-gradient(135deg,#431407,#f97316)", "linear-gradient(135deg,#4c1d95,#ec4899)", "linear-gradient(135deg,#064e3b,#84cc16)"];
  return gradients[Math.floor(Math.random() * gradients.length)];
}

function assetTypeOf(kind: MaterialKind) {
  return kind === "image" || kind === "sd2" ? 1 : kind === "video" ? 2 : 3;
}

function normalizeAssetUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("asset://") ? trimmed : `asset://${trimmed}`;
}

function getStoredUsers(): Record<string, AuthUser> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(USER_STORAGE_KEY) || "{}") as Record<string, AuthUser>;
  } catch {
    return {};
  }
}

function usersToMap(users: AuthUser[]) {
  return Object.fromEntries(users.map(user => [user.account, user])) as AuthUsers;
}

function roleLabel(role: MemberRole) {
  if (role === "super_admin") return "系统管理员";
  if (role === "tenant_admin") return "管理员";
  return "用户";
}

function roleScope(role: MemberRole) {
  if (role === "super_admin") return "平台配置、租户管理与全部功能";
  if (role === "tenant_admin") return "本租户成员管理与生产功能";
  return "项目生产功能";
}

function canManageMembers(role: MemberRole) {
  return role === "super_admin" || role === "tenant_admin";
}

function canManageApiProfiles(role: MemberRole) {
  return role === "super_admin";
}

function assignableRoles(role: MemberRole): MemberRole[] {
  if (role === "super_admin") return ["tenant_admin", "user"];
  if (role === "tenant_admin") return ["user"];
  return [];
}

function canManageTargetMember(operatorRole: MemberRole, targetRole: MemberRole) {
  if (operatorRole === "super_admin") return true;
  if (operatorRole === "tenant_admin") return targetRole === "user";
  return false;
}

function normalizeApiProfiles(saved: ApiProfile[]) {
  const merged = [...defaultApiProfiles];
  saved.forEach(profile => {
    const legacyModel = profile.model === "doubao-seedance-2.0-fast" ? "doubao-seedance-2-0-fast-260128" : profile.model;
    const videoModels = Array.from(new Set([legacyModel, ...(profile.videoModels || [])].map(item => item?.trim()).filter(Boolean) as string[]));
    const imageModels = Array.from(new Set((profile.imageModels || []).map(item => item.trim()).filter(Boolean)));
    const concurrencyLimit = Math.max(1, Math.min(50, Number(profile.concurrencyLimit || 1)));
    const normalizedProfile = { ...profile, model: videoModels[0] || "", videoModels, imageModels, concurrencyLimit };
    const index = merged.findIndex(item => item.id === normalizedProfile.id);
    if (index >= 0) merged[index] = normalizedProfile;
    else merged.push(normalizedProfile);
  });
  const deduped = merged.filter((profile, index, list) => {
    const key = `${profile.name.trim()}|${profile.baseUrl.trim().replace(/\/$/, "")}`;
    return index === list.findIndex(item => `${item.name.trim()}|${item.baseUrl.trim().replace(/\/$/, "")}` === key);
  });
  const activeId = deduped.find(profile => profile.active)?.id || deduped[0]?.id || "";
  return deduped.map(profile => ({ ...profile, active: profile.id === activeId }));
}

function readApiProfiles() {
  if (typeof window === "undefined") return defaultApiProfiles;
  try {
    const saved = JSON.parse(window.localStorage.getItem(API_PROFILE_STORAGE_KEY) || "[]") as ApiProfile[];
    return normalizeApiProfiles(saved);
  } catch {
    return defaultApiProfiles;
  }
}

function writeApiProfiles(profiles: ApiProfile[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(API_PROFILE_STORAGE_KEY, JSON.stringify(profiles));
}

function publicApiProfile(profile?: ApiProfile) {
  if (!profile) return undefined;
  return { id: profile.id, name: profile.name, baseUrl: profile.baseUrl, model: profile.model, videoModels: profile.videoModels, imageModels: profile.imageModels, concurrencyLimit: profile.concurrencyLimit };
}

export default function Home() {
  const [state, setState] = useState<AppState>(seedState);
  const [projectStates, setProjectStates] = useState<ProjectStates>(defaultProjectStates);
  const [projects, setProjects] = useState<Project[]>(defaultProjects);
  const [currentProjectId, setCurrentProjectId] = useState(seedState.project.id);
  const [storageReady, setStorageReady] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("project-home");
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchPromptInput, setBatchPromptInput] = useState("");
  const [projectName, setProjectName] = useState(seedState.project.name);
  const [projectType, setProjectType] = useState(seedState.project.type);
  const [scriptInput, setScriptInput] = useState(seedState.project.script);
  const [shotTitle, setShotTitle] = useState("");
  const [shotPrompt, setShotPrompt] = useState("");
  const [shotRatio, setShotRatio] = useState("9:16 竖屏短剧");
  const [shotDuration, setShotDuration] = useState(5);
  const [shotResolution, setShotResolution] = useState<Shot["resolution"]>("720p");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);
  const [materialName, setMaterialName] = useState("角色参考图");
  const [materialUrl, setMaterialUrl] = useState("");
  const [reviewedAssetInput, setReviewedAssetInput] = useState("");
  const [materialKind, setMaterialKind] = useState<MaterialKind>("image");
  const [materialRole, setMaterialRole] = useState<MaterialRole>("reference_image");
  const [materialMessage, setMaterialMessage] = useState("");
  const [activeAssetTab, setActiveAssetTab] = useState<MaterialKind>("image");
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [imagePromptDraft, setImagePromptDraft] = useState("");
  const [imageWorkbenchPrompt, setImageWorkbenchPrompt] = useState("");
  const [imageModel, setImageModel] = useState("gpt-image-2");
  const [imageQuality, setImageQuality] = useState<ImageQuality>("auto");
  const [imageWidth, setImageWidth] = useState(1024);
  const [imageHeight, setImageHeight] = useState(1024);
  const [imageRatio, setImageRatio] = useState<AspectRatio>("1:1");
  const [imageCount, setImageCount] = useState(1);
  const [generatedImages, setGeneratedImages] = useState<MaterialAsset[]>([]);
  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [lizhenAssets, setLizhenAssets] = useState<VisualAsset[]>([]);
  const [selectedLizhenAssetIds, setSelectedLizhenAssetIds] = useState<string[]>([]);
  const [lizhenAssetMessage, setLizhenAssetMessage] = useState("");
  const [isLoadingLizhenAssets, setIsLoadingLizhenAssets] = useState(false);
  const [showFullScript, setShowFullScript] = useState(false);
  const [scriptTheme, setScriptTheme] = useState("");
  const [scriptCharacters, setScriptCharacters] = useState("");
  const [scriptStyle, setScriptStyle] = useState("都市情感");
  const [scriptEpisodeCount, setScriptEpisodeCount] = useState(12);
  const [scriptOutline, setScriptOutline] = useState("");
  const [scriptEpisodeSplit, setScriptEpisodeSplit] = useState("");
  const [scriptOptimizationNote, setScriptOptimizationNote] = useState("");
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [showAllImageResults, setShowAllImageResults] = useState(false);
  const [showAllShots, setShowAllShots] = useState(false);
  const [expandedShotContentIds, setExpandedShotContentIds] = useState<number[]>([]);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showAllVideoAssets, setShowAllVideoAssets] = useState(false);
  const [showAllLizhenAssets, setShowAllLizhenAssets] = useState(false);
  const [memberRoleDraft, setMemberRoleDraft] = useState<MemberRole>("user");
  const [memberAccountDraft, setMemberAccountDraft] = useState("");
  const [memberNameDraft, setMemberNameDraft] = useState("");
  const [memberPasswordDraft, setMemberPasswordDraft] = useState("");
  const [memberEditorOpen, setMemberEditorOpen] = useState(false);
  const [editingMemberAccount, setEditingMemberAccount] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileSection, setProfileSection] = useState<ProfileSection>("basic");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [securityPhone, setSecurityPhone] = useState("17302194360");
  const [securityCode, setSecurityCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [languageLabel, setLanguageLabel] = useState("简体中文");
  const [userActionMessage, setUserActionMessage] = useState("");
  const [apiProfiles, setApiProfiles] = useState<ApiProfile[]>(defaultApiProfiles);
  const [activeApiProfileId, setActiveApiProfileId] = useState("");
  const [apiProfileName, setApiProfileName] = useState("");
  const [apiProfileBaseUrl, setApiProfileBaseUrl] = useState("");
  const [apiProfileKey, setApiProfileKey] = useState("");
  const [apiProfileVideoModels, setApiProfileVideoModels] = useState("");
  const [apiProfileImageModels, setApiProfileImageModels] = useState("");
  const [apiProfileConcurrencyLimit, setApiProfileConcurrencyLimit] = useState(1);
  const [selectedVideoModel, setSelectedVideoModel] = useState("doubao-seedance-2-0-fast-260128");
  const [addingApiProfile, setAddingApiProfile] = useState(false);
  const [apiProfileEditorOpen, setApiProfileEditorOpen] = useState(false);
  const [editingApiProfileId, setEditingApiProfileId] = useState("");
  const [batchTargetDuration, setBatchTargetDuration] = useState(12);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [omniReferenceEnabled, setOmniReferenceEnabled] = useState(false);
  const mentionMaterials = state.materials.filter(material => material.kind === "image");

  const [authUsers, setAuthUsers] = useState<Record<string, AuthUser>>({});
  const [authReady, setAuthReady] = useState(false);
  const [showLoginPage, setShowLoginPage] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loginAccount, setLoginAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  function loadApiProfileDraft(profile?: ApiProfile) {
    setApiProfileName(profile?.name || "");
    setApiProfileBaseUrl(profile?.baseUrl || "");
    setApiProfileKey("");
    setApiProfileVideoModels((profile?.videoModels || []).join("\n"));
    setApiProfileImageModels((profile?.imageModels || []).join("\n"));
    setApiProfileConcurrencyLimit(Math.max(1, Math.min(50, Number(profile?.concurrencyLimit || 1))));
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedLanguage = window.localStorage.getItem("manjing-language");
      if (savedLanguage) setLanguageLabel(savedLanguage);
      const profiles = readApiProfiles();
      setApiProfiles(profiles);
      writeApiProfiles(profiles);
      const savedActiveProfileId = window.localStorage.getItem(ACTIVE_API_PROFILE_STORAGE_KEY) || profiles.find(item => item.active)?.id || profiles[0]?.id || "";
      const nextActiveProfileId = profiles.some(item => item.id === savedActiveProfileId) ? savedActiveProfileId : profiles[0]?.id || "";
      setActiveApiProfileId(nextActiveProfileId);
      loadApiProfileDraft(profiles.find(item => item.id === nextActiveProfileId));
      if (nextActiveProfileId) window.localStorage.setItem(ACTIVE_API_PROFILE_STORAGE_KEY, nextActiveProfileId);
      else window.localStorage.removeItem(ACTIVE_API_PROFILE_STORAGE_KEY);
      fetch("/api/api-profiles").then(response => response.json()).then(result => {
        if (result.code !== 0 || !Array.isArray(result.data)) return;
        const serverProfiles = normalizeApiProfiles(result.data as ApiProfile[]);
        setApiProfiles(serverProfiles);
        writeApiProfiles(serverProfiles);
        const serverActiveId = serverProfiles.find(profile => profile.active)?.id || serverProfiles[0]?.id || "";
        setActiveApiProfileId(serverActiveId);
        loadApiProfileDraft(serverProfiles.find(profile => profile.id === serverActiveId));
        if (serverActiveId) window.localStorage.setItem(ACTIVE_API_PROFILE_STORAGE_KEY, serverActiveId);
        else window.localStorage.removeItem(ACTIVE_API_PROFILE_STORAGE_KEY);
      }).catch(() => undefined);
      fetch("/api/auth/me").then(async response => {
        const result = await response.json();
        if (!response.ok || result.code !== 0 || !result.data) throw new Error(result.message || "未登录");
        setAuthUsers(prev => ({ ...prev, [result.data.account]: result.data as AuthUser }));
        setCurrentUser(result.data.account);
        setShowLoginPage(false);
        return fetchUsers();
      }).catch(() => {
        setCurrentUser(null);
        setShowLoginPage(true);
      }).finally(() => setAuthReady(true));
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthReady(true);
    }
  }, []);

  async function fetchUsers() {
    const response = await fetch("/api/users");
    const result = await response.json();
    if (!response.ok || result.code !== 0 || !Array.isArray(result.data)) throw new Error(result.message || "加载成员失败");
    setAuthUsers(usersToMap(result.data as AuthUser[]));
  }

  useEffect(() => {
    if (!authReady || !currentUser) return;
    fetchUsers().catch(() => undefined);
  }, [authReady, currentUser]);

  useEffect(() => {
    const role = currentUser ? authUsers[currentUser]?.role || "user" : "user";
    if (!canManageMembers(role) && activeSection === "members") setActiveSection("project-home");
    if (!canManageApiProfiles(role) && activeSection === "channel-management") setActiveSection("project-home");
  }, [authUsers, currentUser, activeSection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentUser) window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ account: currentUser }));
    else window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setProjectStates(defaultProjectStates);
      setProjects(defaultProjects);
      setStorageReady(true);
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      const nextState = normalizeAppState(parsed.state || parsed);
      const savedProjectStates = parsed.projectStates || { [nextState.project.id]: nextState };
      const nextProjectStates: ProjectStates = Object.fromEntries(
        Object.entries({ ...defaultProjectStates, ...savedProjectStates }).map(([id, item]) => [id, normalizeAppState(item as Partial<AppState>)])
      );
      const savedProjects: Project[] = Array.isArray(parsed.projects) ? parsed.projects : Object.values(savedProjectStates).map((item: unknown) => normalizeAppState(item as Partial<AppState>).project);
      const savedProjectIds = new Set(savedProjects.map(project => project.id));
      const nextProjects = [...savedProjects, ...defaultProjects.filter(project => !savedProjectIds.has(project.id))];
      const nextCurrentProjectId = parsed.currentProjectId || nextState.project.id;
      const currentState = nextProjectStates[nextCurrentProjectId] || nextState;
      setState(currentState);
      setProjectStates(nextProjectStates);
      setProjects(nextProjects);
      setCurrentProjectId(nextCurrentProjectId);
      setScriptInput(currentState.project.script);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      setState(seedState);
      setProjectStates(defaultProjectStates);
      setProjects(defaultProjects);
      setCurrentProjectId(seedState.project.id);
      setScriptInput(seedState.project.script);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    setProjectStates(prev => ({ ...prev, [currentProjectId]: state }));
  }, [state, currentProjectId, storageReady]);

  useEffect(() => {
    if (!storageReady || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, projectStates, projects, currentProjectId }));
  }, [state, projectStates, projects, currentProjectId, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    loadLizhenAssets();
  }, [storageReady]);

  async function loadLizhenAssets() {
    try {
      setIsLoadingLizhenAssets(true);
      setLizhenAssetMessage("正在同步外接资产库...");
      const response = await fetch(`/api/assets?group_id=${DEFAULT_ASSET_GROUP_ID}&group_name=user_216&page=1&page_size=50`);
      const result = await response.json();
      if (!response.ok || result.code !== 0) throw new Error(result.message || "加载外接资产失败");
      setLizhenAssets(result.data || []);
      setLizhenAssetMessage(`已同步 ${result.total || 0} 个外接资产`);
    } catch (error) {
      setLizhenAssetMessage(error instanceof Error ? error.message : "加载外接资产失败");
    } finally {
      setIsLoadingLizhenAssets(false);
    }
  }

  async function upsertMember() {
    if (!currentUser) return alert("请先登录管理员账号。");
    if (!canManageMembers(authUsers[currentUser]?.role || "user")) return alert("只有管理员可以添加或修改成员。");
    const account = memberAccountDraft.trim();
    if (!account) return alert("请输入成员账号。");
    const current = authUsers[account];
    const body = {
      account,
      displayName: memberNameDraft.trim() || account,
      role: memberRoleDraft,
      password: memberPasswordDraft.trim()
    };
    const response = await fetch(current ? `/api/users/${current.id}` : "/api/users", {
      method: current ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok || result.code !== 0) return alert(result.message || "保存成员失败。");
    await fetchUsers();
    closeMemberEditor();
    setUserActionMessage(current ? "成员信息已更新。" : "成员账号已创建。");
  }

  function openNewMemberEditor() {
    setEditingMemberAccount("");
    setMemberAccountDraft("");
    setMemberNameDraft("");
    setMemberPasswordDraft("");
    setMemberRoleDraft(memberRoleOptions[0] || "user");
    setMemberEditorOpen(true);
  }

  function openEditMemberEditor(user: AuthUser) {
    setEditingMemberAccount(user.account);
    setMemberAccountDraft(user.account);
    setMemberNameDraft(user.displayName || user.account);
    setMemberRoleDraft(memberRoleOptions.includes(user.role) ? user.role : memberRoleOptions[0] || "user");
    setMemberPasswordDraft("");
    setMemberEditorOpen(true);
  }

  function closeMemberEditor() {
    setEditingMemberAccount("");
    setMemberAccountDraft("");
    setMemberNameDraft("");
    setMemberPasswordDraft("");
    setMemberEditorOpen(false);
  }

  async function updateMemberStatus(account: string, status: AuthUser["status"]) {
    if (!currentUser) return;
    if (!canManageMembers(authUsers[currentUser]?.role || "user")) return alert("只有管理员可以调整成员状态。");
    if (account === currentUser && status === "disabled") return alert("不能停用当前登录管理员。");
    const target = authUsers[account];
    if (!target) return alert("未找到成员。");
    const response = await fetch(`/api/users/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const result = await response.json();
    if (!response.ok || result.code !== 0) return alert(result.message || "调整成员状态失败。");
    await fetchUsers();
    setUserActionMessage(status === "active" ? "成员已启用。" : "成员已停用。");
  }

  const stats = useMemo(() => {
    const total = state.shots.length;
    const done = state.shots.filter(shot => shot.status === "done").length;
    const running = state.shots.some(shot => shot.status === "running");
    const percent = total ? Math.round((done / total) * 100) : 0;
    const totalDuration = state.shots.reduce((sum, shot) => sum + Number(shot.duration || 0), 0);
    return { total, done, running, percent, totalDuration };
  }, [state.shots]);

  function sectionStyle(section: WorkspaceSection) {
    return { display: activeSection === section ? "block" : "none" } as const;
  }

  function persistWorkspace(nextState: AppState, nextProjectStates: ProjectStates, nextProjects: Project[], nextCurrentProjectId: number) {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state: nextState,
      projectStates: nextProjectStates,
      projects: nextProjects,
      currentProjectId: nextCurrentProjectId
    }));
  }

  function createBlankProject(name: string, type: string): AppState {
    return {
      project: { id: Date.now(), name: name.trim() || "未命名项目", type, script: "" },
      shots: [],
      tasks: [],
      assets: [],
      materials: []
    };
  }

  function saveProject() {
    const newProjectState = createBlankProject(projectName, projectType);
    const nextProjects = [newProjectState.project, ...projects];
    const nextProjectStates = { ...projectStates, [currentProjectId]: state, [newProjectState.project.id]: newProjectState };
    setProjects(nextProjects);
    setProjectStates(nextProjectStates);
    setCurrentProjectId(newProjectState.project.id);
    setState(newProjectState);
    persistWorkspace(newProjectState, nextProjectStates, nextProjects, newProjectState.project.id);
    setScriptInput("");
    setSelectedMaterialIds([]);
    setSelectedLizhenAssetIds([]);
    setGeneratedImages([]);
    setProjectModalOpen(false);
  }

  function switchProject(project: Project) {
    if (project.id === currentProjectId) return;
    const nextState = projectStates[project.id] || createBlankProject(project.name, project.type);
    const nextProjectStates = { ...projectStates, [currentProjectId]: state, [project.id]: nextState };
    setProjectStates(nextProjectStates);
    setCurrentProjectId(project.id);
    setState(nextState);
    persistWorkspace(nextState, nextProjectStates, projects, project.id);
    setScriptInput(nextState.project.script);
    setProjectSwitcherOpen(false);
    setSelectedMaterialIds([]);
    setSelectedLizhenAssetIds([]);
    setGeneratedImages([]);
  }

  function saveScript() {
    const script = scriptInput.trim();
    const nextState = { ...state, project: { ...state.project, script } };
    const nextProjects = projects.map(project => project.id === currentProjectId ? { ...project, script } : project);
    const nextProjectStates = { ...projectStates, [currentProjectId]: nextState };
    setState(nextState);
    setProjects(nextProjects);
    setProjectStates(nextProjectStates);
    persistWorkspace(nextState, nextProjectStates, nextProjects, currentProjectId);
  }

  async function callScriptAI(action: "draft" | "optimize" | "outline") {
    const response = await fetch("/api/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        theme: scriptTheme,
        characters: scriptCharacters,
        style: scriptStyle,
        episodeCount: scriptEpisodeCount,
        script: scriptInput
      })
    });
    const result = await response.json();
    if (!response.ok || result.code !== 0) throw new Error(result.message || "AI 剧本生成失败");
    return result.data?.content as string;
  }

  async function generateScriptDraft() {
    if (!scriptTheme.trim() || !scriptCharacters.trim()) {
      alert("请先填写主题和角色设定。");
      return;
    }
    try {
      setScriptOptimizationNote("正在调用 AI 生成剧本初稿...");
      const draft = await callScriptAI("draft");
      setScriptInput(draft);
      setScriptOptimizationNote("已通过真实 AI 接口生成剧本初稿。");
    } catch (error) {
      alert(error instanceof Error ? error.message : "AI 剧本生成失败");
      setScriptOptimizationNote("剧本初稿生成失败，请检查接口配置。");
    }
  }

  async function optimizeScriptFlow() {
    if (!scriptInput.trim()) {
      alert("请先输入剧本内容。");
      return;
    }
    try {
      setScriptOptimizationNote("正在调用 AI 优化剧本...");
      const optimized = await callScriptAI("optimize");
      setScriptInput(optimized);
      setScriptOptimizationNote("已通过真实 AI 接口优化对话逻辑和情节连贯性。");
    } catch (error) {
      alert(error instanceof Error ? error.message : "AI 剧本优化失败");
      setScriptOptimizationNote("剧本优化失败，请检查接口配置。");
    }
  }

  async function splitScriptToOutlineAndEpisodes() {
    const text = scriptInput.trim();
    if (!text) {
      alert("请先上传或粘贴大段剧本内容。");
      return;
    }
    try {
      setScriptOptimizationNote("正在调用 AI 生成剧本大纲和单集拆分...");
      const result = await callScriptAI("outline");
      setScriptOutline(result);
      setScriptEpisodeSplit(result);
      setScriptOptimizationNote("已通过真实 AI 接口生成剧本大纲与单集拆分。");
    } catch (error) {
      alert(error instanceof Error ? error.message : "AI 剧本拆分失败");
      setScriptOptimizationNote("剧本大纲生成失败，请检查接口配置。");
    }
  }

  function estimateTotalDuration(text: string, fallback = shotDuration) {
    const durationMatch = text.match(/(?:总时长|时长|完整镜头)\D{0,6}(\d+)\s*(?:秒|s)/i) || text.match(/(\d+)\s*(?:秒|s)\s*(?:视频|镜头)/i);
    return durationMatch ? Number(durationMatch[1]) : fallback;
  }

  function splitSentences(text: string) {
    return text
      .replace(/\n+/g, "。")
      .replace(/；/g, "。")
      .replace(/，然后/g, "。然后")
      .replace(/，接着/g, "。接着")
      .replace(/，随后/g, "。随后")
      .replace(/，同时/g, "。同时")
      .split(/[。.!?？]/)
      .map(item => item.trim())
      .filter(item => item.length > 6 && !/^(总时长|时长|风格|比例|格式)/.test(item));
  }

  function createEditedShot(index: number, total: number, action: string, totalDuration: number, segmentDuration: number, ratio = "9:16 竖屏短剧") {
    const title = `镜头 ${String(index + 1).padStart(2, "0")}｜${action.slice(0, 14) || "分镜片段"}`;
    const prompt = [
      `专业短剧分镜 ${index + 1}/${total}，这是完整 ${totalDuration} 秒视频中的第 ${index + 1} 个镜头。`,
      `只生成本镜头内容，目标时长 ${segmentDuration} 秒，不要压缩完整剧情，不要生成其他镜头内容。`,
      `本镜头画面与动作：${action}。`,
      "台词要求：如果本镜头包含台词，只说本镜头台词，语速自然，保留停顿；如果没有台词则不要新增台词。",
      "剪辑要求：动作和台词必须完整表达本镜头，不要自由发挥新增人物、地点、情节或反转。",
      "画面风格：真人写实短剧质感，电影级布光，24帧，禁止字幕。"
    ].join("\n");
    return { id: Date.now() + index, title, prompt, ratio, duration: segmentDuration, status: "pending" as ShotStatus };
  }

  function splitPromptLikeEditor(text: string, ratio = "9:16 竖屏短剧", preferredDuration = shotDuration) {
    const content = text.trim();
    if (!content) return [];
    const totalDuration = estimateTotalDuration(content) || preferredDuration;
    const timelineMatches = Array.from(content.matchAll(/(\d+)\s*[-~—至到]\s*(\d+)\s*秒[：:]\s*([^\n]+)/g));
    if (timelineMatches.length) {
      return timelineMatches.slice(0, 7).map((match, index, list) => {
        const start = Number(match[1]);
        const end = Number(match[2]);
        const action = match[3].trim().replace(/。$/, "");
        const duration = Math.max(3, end - start);
        return createEditedShot(index, list.length, action, Math.max(totalDuration, end), duration, ratio);
      });
    }

    const parts = splitSentences(content);
    if (parts.length < 2) return [];
    const segmentCount = Math.min(7, Math.max(2, Math.round(totalDuration / 3) || Math.min(parts.length, 4)));
    const segmentDuration = Math.max(3, Math.round(totalDuration / segmentCount));
    const chunks = Array.from({ length: segmentCount }, (_, index) => {
      const start = Math.floor(index * parts.length / segmentCount);
      const end = Math.floor((index + 1) * parts.length / segmentCount);
      return parts.slice(start, Math.max(end, start + 1)).join("。") || parts[index % parts.length];
    });
    return chunks.map((action, index) => createEditedShot(index, chunks.length, action, totalDuration, segmentDuration, ratio));
  }

  function splitLongPromptIntoShots(title: string, prompt: string, ratio: string, duration = shotDuration) {
    return splitPromptLikeEditor(prompt, ratio, duration).map((shot, index) => ({ ...shot, title: `${title || "分镜"}｜${String(index + 1).padStart(2, "0")}` }));
  }

  function addShot(preset?: Partial<Pick<Shot, "title" | "prompt" | "ratio" | "duration" | "resolution">>) {
    const nextTitle = (preset?.title ?? shotTitle).trim();
    const nextPrompt = (preset?.prompt ?? shotPrompt).trim();
    const nextRatio = preset?.ratio ?? shotRatio;
    const nextDuration = preset?.duration ?? shotDuration;
    const nextResolution = preset?.resolution ?? shotResolution;
    if (!nextPrompt) {
      alert("请先填写视频提示词。");
      return;
    }
    const splitShots = splitLongPromptIntoShots(nextTitle || "新视频", nextPrompt, nextRatio, nextDuration);
    if (splitShots.length > 1) {
      setState(prev => ({ ...prev, shots: [...prev.shots, ...splitShots.map(item => ({ ...item, resolution: nextResolution }))] }));
      setShotTitle("");
      setShotPrompt("");
      splitShots.forEach((shot, index) => window.setTimeout(() => startGeneration(shot.id, { ...shot, resolution: nextResolution }), index * 800));
      return;
    }
    const id = Date.now();
    const nextShot: Shot = { id, title: nextTitle || `视频 ${state.shots.length + 1}`, prompt: nextPrompt, ratio: nextRatio, duration: nextDuration, resolution: nextResolution, status: "pending", ...shotSizeForRatio(nextRatio) };
    setState(prev => ({ ...prev, shots: [...prev.shots, nextShot] }));
    setShotTitle("");
    setShotPrompt("");
    startGeneration(id, nextShot);
  }


  function splitExistingShot(shot: Shot) {
    const splitShots = splitLongPromptIntoShots(shot.title.replace(/｜\d+$/, ""), shot.prompt, shot.ratio, Math.max(12, shot.duration));
    if (splitShots.length <= 1) {
      alert("这条分镜没有足够内容可拆分，请补充更完整的动作和台词，或使用 0-3秒/3-6秒 时间轴格式。");
      return;
    }
    setState(prev => ({
      ...prev,
      shots: prev.shots.flatMap(item => item.id === shot.id ? splitShots : [item]),
      tasks: prev.tasks.filter(task => task.shotId !== shot.id),
      assets: prev.assets.filter(asset => asset.shotId !== shot.id)
    }));
    splitShots.forEach((item, index) => window.setTimeout(() => startGeneration(item.id, item), index * 800));
  }

  function generateShotOrSplit(shot: Shot) {
    const alreadySegmented = shot.prompt.includes("只生成本段内容") || /第\s*\d+\/\d+\s*段/.test(shot.prompt);
    const canSplit = splitLongPromptIntoShots(shot.title, shot.prompt, shot.ratio, Math.max(12, shot.duration)).length > 1;
    if (!alreadySegmented && canSplit) {
      splitExistingShot(shot);
      return;
    }
    startGeneration(shot.id);
  }

  function createSinglePromptShot(text: string, duration: number) {
    const content = text.trim();
    const prompt = [
      `这是一个完整的 ${duration} 秒短剧镜头，不要压缩到 3 秒。`,
      `完整画面和动作：${content}。`,
      `生成要求：按 ${duration} 秒节奏自然表达完整内容，动作和台词要完整，语速正常，保留停顿。`,
      "不要自由发挥新增人物、地点、情节或反转；严格按照提示词内容生成。",
      "真人写实短剧质感，电影级布光，24帧，禁止字幕。"
    ].join("\n");
    return { id: Date.now(), title: `镜头 01｜完整${duration}秒镜头`, prompt, ratio: "9:16 竖屏短剧", duration, status: "pending" as ShotStatus };
  }

  function importBatchShots() {
    const targetDuration = estimateTotalDuration(batchPromptInput) || batchTargetDuration;
    const shots = splitPromptLikeEditor(batchPromptInput, "9:16 竖屏短剧", targetDuration);
    const nextShots = shots.length ? shots : [createSinglePromptShot(batchPromptInput, batchTargetDuration)];
    setState(prev => ({ ...prev, shots: [...prev.shots, ...nextShots] }));
    setBatchPromptInput("");
    setBatchModalOpen(false);
  }

  async function saveProfile() {
    if (!currentUser) return;
    const current = authUsers[currentUser];
    if (!current) return;
    const response = await fetch(`/api/users/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: memberNameDraft.trim() || current.displayName || current.account })
    });
    const result = await response.json();
    if (!response.ok || result.code !== 0) return alert(result.message || "个人信息更新失败。");
    await fetchUsers();
    setUserActionMessage("个人信息已更新。");
  }

  function createApiKey() {
    setUserActionMessage("个人 API Key 管理会在账号体系稳定后接入服务端存储。");
  }

  function deleteApiKey(id: string) {
    void id;
    setUserActionMessage("个人 API Key 管理会在账号体系稳定后接入服务端存储。");
  }

  function inferApiProfileDraft(baseUrlValue: string, apiKeyValue: string) {
    const normalizedUrl = baseUrlValue.trim().toLowerCase();
    const normalizedKey = apiKeyValue.trim().toLowerCase();
    if (normalizedUrl.includes("/api/v3") || normalizedUrl.includes("43.159.135.17") || normalizedKey.startsWith("arkr_")) return { name: "Ark v3 测试平台", videoModels: "doubao-seedance-2-0-fast-260128\ndoubao-seedance-2-0-260128", imageModels: "doubao-seedream-3-0-t2i-250415" };
    if (normalizedUrl.includes("aifastgate")) return { name: "AIfastgate", videoModels: "doubao-seedance-2-0-fast-260128", imageModels: "" };
    const host = (() => { try { return new URL(baseUrlValue).hostname.replace(/^api\./, ""); } catch { return "第三方 API"; } })();
    return { name: host || "第三方 API", videoModels: "doubao-seedance-2-0-fast-260128", imageModels: "" };
  }

  function updateApiProfileDraft(field: "baseUrl" | "apiKey", value: string) {
    const nextBaseUrl = field === "baseUrl" ? value : apiProfileBaseUrl;
    const nextApiKey = field === "apiKey" ? value : apiProfileKey;
    if (field === "baseUrl") setApiProfileBaseUrl(value);
    else setApiProfileKey(value);
    if (!nextBaseUrl.trim()) return;
    const inferred = inferApiProfileDraft(nextBaseUrl, nextApiKey);
    if (!apiProfileName.trim() || ["Ark v3 测试平台", "AIfastgate", "第三方 API"].includes(apiProfileName.trim())) setApiProfileName(inferred.name);
    if (!apiProfileVideoModels.trim()) setApiProfileVideoModels(inferred.videoModels);
    if (!apiProfileImageModels.trim()) setApiProfileImageModels(inferred.imageModels);
  }

  function openNewApiProfileEditor() {
    setAddingApiProfile(true);
    setApiProfileEditorOpen(true);
    setEditingApiProfileId("");
    setApiProfileName("");
    setApiProfileBaseUrl("");
    setApiProfileKey("");
    setApiProfileVideoModels("");
    setApiProfileImageModels("");
    setApiProfileConcurrencyLimit(1);
    setUserActionMessage("");
  }

  function openEditApiProfileEditor(profile: ApiProfile) {
    setAddingApiProfile(false);
    setApiProfileEditorOpen(true);
    setEditingApiProfileId(profile.id);
    loadApiProfileDraft(profile);
    setUserActionMessage("");
  }

  function closeApiProfileEditor() {
    setAddingApiProfile(false);
    setApiProfileEditorOpen(false);
    setEditingApiProfileId("");
    loadApiProfileDraft(apiProfiles.find(profile => profile.id === activeApiProfileId));
  }

  async function saveApiProfile() {
    const name = apiProfileName.trim();
    const baseUrl = apiProfileBaseUrl.trim().replace(/\/$/, "");
    const apiKey = apiProfileKey.trim();
    const videoModels = Array.from(new Set(apiProfileVideoModels.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)));
    const imageModels = Array.from(new Set(apiProfileImageModels.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)));
    const concurrencyLimit = Math.max(1, Math.min(50, Number(apiProfileConcurrencyLimit || 1)));
    const editingProfile = !addingApiProfile ? apiProfiles.find(profile => profile.id === editingApiProfileId) : undefined;
    if (!name || !baseUrl || (!apiKey && !editingProfile?.hasApiKey) || (!videoModels.length && !imageModels.length)) return alert("请完整填写服务名称、Base URL、API Key，并至少配置一个视频或图片模型 ID。编辑已有配置时 API Key 可留空。");
    try {
      const response = await fetch("/api/api-profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingProfile?.id, name, baseUrl, apiKey, videoModels, imageModels, concurrencyLimit, active: editingProfile?.active ?? apiProfiles.length === 0 }) });
      const result = await response.json();
      if (!response.ok || result.code !== 0 || !result.data) throw new Error(result.message || "保存模型渠道失败");
      const savedProfile = result.data as ApiProfile;
      const next = normalizeApiProfiles([savedProfile, ...apiProfiles.filter(profile => profile.id !== savedProfile.id)]);
      setApiProfiles(next);
      writeApiProfiles(next);
      setApiProfileKey("");
      setAddingApiProfile(false);
      setApiProfileEditorOpen(false);
      setEditingApiProfileId("");
      const nextActiveId = next.find(profile => profile.active)?.id || "";
      setActiveApiProfileId(nextActiveId);
      setSelectedVideoModel(videoModels[0] || selectedVideoModel);
      setImageModel(imageModels[0] || imageModel);
      if (nextActiveId) window.localStorage.setItem(ACTIVE_API_PROFILE_STORAGE_KEY, nextActiveId);
      setUserActionMessage(`${result.updated ? "已更新" : "已保存"}模型渠道：${name}。API Key 已隐藏保存。`);
    } catch (error) {
      setUserActionMessage(error instanceof Error ? error.message : "保存模型渠道失败");
    }
  }

  async function switchApiProfile(id: string) {
    const target = apiProfiles.find(item => item.id === id);
    if (!target) return alert("未找到这个模型渠道，请刷新后重试。");
    try {
      const response = await fetch("/api/api-profiles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const result = await response.json();
      if (!response.ok || result.code !== 0) throw new Error(result.message || "设置当前模型渠道失败");
      const next = apiProfiles.map(item => ({ ...item, active: item.id === id }));
      setApiProfiles(next);
      setActiveApiProfileId(id);
      loadApiProfileDraft(target);
      setSelectedVideoModel(target.videoModels[0] || selectedVideoModel);
      setImageModel(target.imageModels[0] || imageModel);
      writeApiProfiles(next);
      window.localStorage.setItem(ACTIVE_API_PROFILE_STORAGE_KEY, id);
      setUserActionMessage(`当前模型渠道已切换为：${target.name}。`);
    } catch (error) {
      setUserActionMessage(error instanceof Error ? error.message : "设置当前模型渠道失败");
    }
  }

  async function deleteApiProfile(id: string) {
    try {
      const response = await fetch(`/api/api-profiles?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || result.code !== 0) throw new Error(result.message || "删除模型渠道失败");
      const remainingProfiles = apiProfiles.filter(item => item.id !== id);
      const nextActiveId = activeApiProfileId === id ? remainingProfiles[0]?.id || "" : activeApiProfileId;
      const normalized = apiProfiles.filter(item => item.id !== id).map(item => ({ ...item, active: item.id === nextActiveId }));
      setApiProfiles(normalized);
      setActiveApiProfileId(nextActiveId);
      loadApiProfileDraft(normalized.find(profile => profile.id === nextActiveId));
      if (editingApiProfileId === id) closeApiProfileEditor();
      writeApiProfiles(normalized);
      if (nextActiveId) window.localStorage.setItem(ACTIVE_API_PROFILE_STORAGE_KEY, nextActiveId);
      else window.localStorage.removeItem(ACTIVE_API_PROFILE_STORAGE_KEY);
      setUserActionMessage("已删除模型渠道。");
    } catch (error) {
      setUserActionMessage(error instanceof Error ? error.message : "删除模型渠道失败");
    }
  }

  async function ensureAssetGroup() {
    if (state.assetGroupId) return state.assetGroupId;
    setState(prev => ({ ...prev, assetGroupId: DEFAULT_ASSET_GROUP_ID }));
    return DEFAULT_ASSET_GROUP_ID;
  }

  async function addMaterialFromUrl() {
    const reviewedAssetUrl = normalizeAssetUrl(reviewedAssetInput);
    if (!materialUrl.trim() && !reviewedAssetUrl) {
      alert("请填写公网素材 URL。外接资产 OpenAPI 创建资产需要公网可访问链接；本地文件只能预览，不能直接提交资产库。");
      return;
    }

    const materialId = Date.now();
    const material: MaterialAsset = {
      id: materialId,
      name: materialName.trim() || "未命名素材",
      url: materialUrl.trim(),
      kind: materialKind,
      role: materialRole,
      previewUrl: materialUrl.trim(),
      reviewedAssetUrl
    };

    setState(prev => ({ ...prev, materials: [material, ...prev.materials] }));
    setMaterialUrl("");
    setReviewedAssetInput("");

    if (reviewedAssetUrl) {
      setMaterialMessage(`已绑定外接资产：${reviewedAssetUrl}，生成视频会优先调用它。`);
      return;
    }

    try {
      setMaterialMessage("素材已加入漫镜，正在自动上传到外接资产库...");
      const groupId = await ensureAssetGroup();
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, url: material.url, asset_name: material.name, asset_type: assetTypeOf(material.kind) })
      });
      const result = await response.json();
      if (!response.ok || result.code !== 0 || !result.data?.asset_url) throw new Error(result.message || "上传外接资产库失败");
      setState(prev => ({ ...prev, materials: prev.materials.map(item => item.id === materialId ? { ...item, seedanceAssetUrl: result.data.asset_url } : item) }));
      setMaterialMessage(`素材已上传到外接资产库：${result.data.asset_url}。OpenAPI 创建资产默认可用，后续生成视频会自动调用它。`);
    } catch (error) {
      setMaterialMessage(error instanceof Error ? `素材已加入漫镜，但上传外接资产失败：${error.message}` : "素材已加入漫镜，但上传外接资产失败");
    }
  }

  function addLocalPreview(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const kind: MaterialKind = file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image";
    const role: MaterialRole = kind === "image" ? "reference_image" : kind === "video" ? "reference_video" : "reference_audio";
    const material: MaterialAsset = { id: Date.now(), name: file.name, url: "", kind, role, previewUrl: URL.createObjectURL(file) };
    setState(prev => ({ ...prev, materials: [material, ...prev.materials] }));
    setMaterialMessage("本地文件已加入预览库。注意：真实生成仍需公网 URL，不能直接使用本地文件。");
    event.target.value = "";
  }

  async function registerMaterialToSeedance(materialId: number) {
    const material = state.materials.find(item => item.id === materialId);
    if (!material?.url) {
      alert("该素材没有公网 URL，无法登记到 Seedance 资产库。");
      return;
    }
    try {
      setMaterialMessage("正在登记素材到 Seedance 资产库...");
      const groupId = await ensureAssetGroup();
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, url: material.url, asset_name: material.name, asset_type: assetTypeOf(material.kind) })
      });
      const result = await response.json();
      if (!response.ok || result.code !== 0 || !result.data?.asset_url) throw new Error(result.message || "登记素材失败");
      setState(prev => ({ ...prev, materials: prev.materials.map(item => item.id === materialId ? { ...item, seedanceAssetUrl: result.data.asset_url } : item) }));
      setMaterialMessage(`素材已上传到外接资产库：${result.data.asset_url}`);
    } catch (error) {
      setMaterialMessage(error instanceof Error ? error.message : "登记素材失败");
    }
  }

  function deleteMaterial(materialId: number) {
    setSelectedMaterialIds(prev => prev.filter(id => id !== materialId));
    setState(prev => ({ ...prev, materials: prev.materials.filter(material => material.id !== materialId) }));
    setMaterialMessage("素材已删除，并已从 @ 引用中移除。");
  }

  function toggleMaterial(id: number) {
    setSelectedMaterialIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  }

  function toggleLizhenAsset(id: string) {
    setSelectedLizhenAssetIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  }

  function materialApiUrl(item: MaterialAsset) {
    return item.reviewedAssetUrl || item.seedanceAssetUrl || item.url;
  }

  function buildMediaPayload() {
    const selected = state.materials.filter(item => selectedMaterialIds.includes(item.id));
    const selectedLizhenAssets = lizhenAssets.filter(item => selectedLizhenAssetIds.includes(item.id));
    return {
      images: [
        ...selected.filter(item => item.kind === "image" && materialApiUrl(item)).map(item => ({ url: materialApiUrl(item), role: item.role })),
        ...selectedLizhenAssets.filter(item => item.类型 === "图片").map(item => ({ url: item.asset_url, role: "reference_image" }))
      ],
      videos: [
        ...selected.filter(item => item.kind === "video" && materialApiUrl(item)).map(item => ({ url: materialApiUrl(item), role: item.role })),
        ...selectedLizhenAssets.filter(item => item.类型 === "视频").map(item => ({ url: item.asset_url, role: "reference_video" }))
      ],
      audios: [
        ...selected.filter(item => item.kind === "audio" && materialApiUrl(item)).map(item => ({ url: materialApiUrl(item), role: item.role })),
        ...selectedLizhenAssets.filter(item => item.类型 === "音频").map(item => ({ url: item.asset_url, role: "reference_audio" }))
      ]
    };
  }

  function buildShotWithReferencePrompt(shot: Shot): Shot {
    const selectedInternalAssets = state.materials.filter(item => selectedMaterialIds.includes(item.id) && item.kind === "image" && materialApiUrl(item));
    const selectedExternalAssets = lizhenAssets.filter(item => selectedLizhenAssetIds.includes(item.id) && item.类型 === "图片");
    if (!selectedInternalAssets.length && !selectedExternalAssets.length) return shot;
    const internalLines = selectedInternalAssets.map(item => `- ${item.name}：严格参考素材 ${materialApiUrl(item)} 的人物/场景/道具外观，不要重新设计外貌。`);
    const externalLines = selectedExternalAssets.map(item => `- ${item.asset_name}：严格参考外接资产 ${item.asset_url} 的人物/场景/道具外观，不要重新设计外貌。`);
    return {
      ...shot,
      prompt: `${shot.prompt}\n\n真实参考素材绑定：\n${[...internalLines, ...externalLines].join("\n")}\n生成要求：画面中的同名角色、场景和道具必须优先保持与对应参考素材一致，尤其人物脸型、五官、发型、年龄感、服装气质要保持一致；禁止生成与参考素材不一致的新人物。`
    };
  }

  function inferInputType() {
    const selected = state.materials.filter(item => selectedMaterialIds.includes(item.id));
    const roles = selected.map(item => item.role);
    return roles.includes("first_frame") || roles.includes("last_frame") ? "first_last_frame" : "reference";
  }

  async function startGeneration(shotId: number, injectedShot?: Shot) {
    const shot = injectedShot || state.shots.find(item => item.id === shotId);
    if (!shot) return;

    const localTaskId = `MV-${String(Date.now()).slice(-6)}`;
    const localOnlyMaterials = state.materials.filter(item => selectedMaterialIds.includes(item.id) && !materialApiUrl(item));
    if (localOnlyMaterials.length) {
      setMaterialMessage(`已选择 ${localOnlyMaterials.length} 个仅本地预览素材，真实 API 无法读取：${localOnlyMaterials.map(item => item.name).join("、")}。请改用公网 URL 或已登记 asset:// 素材。`);
      alert("你 @ 的图片里有本地上传素材。浏览器本地文件不会上传到视频 API，真实生成不会使用这些图片。请先填写公网 URL 或使用已登记 asset:// 素材。");
      return;
    }

    if (omniReferenceEnabled && !omniReferenceItems.length) {
      alert("全能参考模式需要先 @ 选择至少 1 个真实可用参考素材，或在外接资产库勾选 asset:// 资产。");
      return;
    }

    const concurrencyLimit = Math.max(1, Number(activeApiProfile?.concurrencyLimit || 1));
    const runningTaskCount = state.tasks.filter(task => task.status === "running").length;
    if (runningTaskCount >= concurrencyLimit) {
      alert(`当前渠道并发数为 ${concurrencyLimit}，已有 ${runningTaskCount} 个任务生成中。请等待任务完成后再提交。`);
      return;
    }

    const selectedAssetCount = state.materials.filter(item => selectedMaterialIds.includes(item.id) && materialApiUrl(item)).length + selectedLizhenAssetIds.length;
    const taskApiProfile = publicApiProfile(activeApiProfile);
    const taskProviderName = activeApiProfile?.name || "未选择渠道";
    const taskProviderBaseUrl = taskApiProfile?.baseUrl || "";
    const modelForGeneration = selectedVideoModel || activeApiProfile?.videoModels[0] || activeApiProfile?.model || "";
    const taskChannelText = taskProviderBaseUrl ? `${taskProviderName}（${taskProviderBaseUrl}）` : taskProviderName;
    const task: VideoTask = { id: localTaskId, shotId: shot.id, shotTitle: shot.title, provider: taskProviderName, status: "running", result: selectedAssetCount ? `任务已提交，使用接口：${taskChannelText}，模型：${modelForGeneration || "未选择模型"}，${omniReferenceEnabled ? "全能参考模式已启用，" : ""}正在调用 ${selectedAssetCount} 个真实可用素材` : `任务已提交，使用接口：${taskChannelText}，模型：${modelForGeneration || "未选择模型"}` };

    setState(prev => ({
      ...prev,
      shots: prev.shots.map(item => item.id === shotId ? { ...item, status: "running" } : item),
      tasks: [task, ...prev.tasks.filter(item => !(item.shotId === shotId && item.status === "running"))]
    }));

    const shotForGeneration = buildShotWithReferencePrompt(shot);

    try {
      const response = await fetch("/api/video-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shot: omniReferenceEnabled ? { ...shotForGeneration, prompt: `${shotForGeneration.prompt}\n\n全能参考模式：已启用。请综合所有提交的图片、视频、音频参考素材，保持人物外貌、服装、场景、道具、动作节奏和画面风格一致。优先遵循 reference inputs，不要自行替换角色或背景。` } : shotForGeneration, provider: "seedance-2.0", model_id: modelForGeneration, resolution: shot.resolution || "720p", input_type: inferInputType(), omni_reference: omniReferenceEnabled, profile_id: activeApiProfile?.id, api_profile: taskApiProfile, ...buildMediaPayload() })
      });
      const result = await response.json();
      if (!response.ok || result.code !== 0 || !result.data?.task_id) throw new Error(result.message || "创建视频任务失败");
      const providerTaskId = result.data.task_id as string;
      const selectedLizhenNames = lizhenAssets.filter(item => selectedLizhenAssetIds.includes(item.id)).map(item => item.asset_name).join("、");
      const actualProvider = result.data.provider || taskProviderName;
      const actualBaseUrl = result.data.base_url || taskProviderBaseUrl;
      const actualModel = result.data.model || modelForGeneration;
      setState(prev => ({ ...prev, tasks: prev.tasks.map(item => item.id === localTaskId ? { ...item, provider: actualProvider, providerTaskId, result: `任务已提交：${providerTaskId}｜接口：${actualProvider}（${actualBaseUrl}）｜模型：${actualModel}${selectedLizhenNames ? `｜参考素材：${selectedLizhenNames}` : ""}` } : item) }));
      pollGenerationStatus(shotId, localTaskId, providerTaskId, activeApiProfile?.id, taskApiProfile);
    } catch (error) {
      markGenerationFailed(shotId, localTaskId, error instanceof Error ? error.message : "创建视频任务失败");
    }
  }

  function pollGenerationStatus(shotId: number, localTaskId: string, providerTaskId: string, profileId = activeApiProfile?.id, apiProfile = publicApiProfile(activeApiProfile)) {
    window.setTimeout(async () => {
      try {
        const response = await fetch("/api/video-tasks/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task_id: providerTaskId, profile_id: profileId, api_profile: apiProfile }) });
        const result = await response.json();
        if (!response.ok || result.code !== 0 || !result.data) throw new Error(result.message || "查询视频任务失败");
        const data = result.data as { status: string; video_url?: string; duration?: number; error?: string };
        if (["pending", "submitted", "queued", "running", "processing"].includes(data.status)) {
          setState(prev => ({ ...prev, tasks: prev.tasks.map(item => item.id === localTaskId ? { ...item, status: "running", result: `生成中：${data.status}｜任务ID：${providerTaskId}` } : item), shots: prev.shots.map(item => item.id === shotId ? { ...item, status: "running" } : item) }));
          pollGenerationStatus(shotId, localTaskId, providerTaskId, profileId, apiProfile);
          return;
        }
        if (data.status === "succeeded" && data.video_url) {
          return completeGeneration(shotId, localTaskId, data.video_url, data.duration, providerTaskId);
        }
        if (data.status === "succeeded" && !data.video_url) {
          setState(prev => ({ ...prev, tasks: prev.tasks.map(item => item.id === localTaskId ? { ...item, result: "生成已完成，正在等待视频地址同步" } : item) }));
          pollGenerationStatus(shotId, localTaskId, providerTaskId, profileId, apiProfile);
          return;
        }
        if (["failed", "error", "cancelled", "canceled"].includes(data.status)) {
          markGenerationFailed(shotId, localTaskId, data.error || "视频生成失败");
          return;
        }
        setState(prev => ({ ...prev, tasks: prev.tasks.map(item => item.id === localTaskId ? { ...item, result: `等待上游同步：${data.status || "unknown"}` } : item) }));
        pollGenerationStatus(shotId, localTaskId, providerTaskId, profileId, apiProfile);
      } catch (error) {
        setState(prev => ({ ...prev, tasks: prev.tasks.map(item => item.id === localTaskId ? { ...item, result: error instanceof Error ? `状态查询暂未成功，继续重试：${error.message}` : "状态查询暂未成功，继续重试" } : item) }));
        pollGenerationStatus(shotId, localTaskId, providerTaskId, profileId, apiProfile);
      }
    }, 5000);
  }

  function completeGeneration(shotId: number, localTaskId: string, videoUrl: string, realDuration?: number, providerTaskId?: string) {
    setState(prev => {
      const shot = prev.shots.find(item => item.id === shotId);
      if (!shot) return prev;
      const index = prev.shots.findIndex(item => item.id === shotId);
      const existingTask = prev.tasks.find(item => item.id === localTaskId);
      const asset: VideoAsset = { id: Date.now(), shotId, title: `镜头 #${String(index + 1).padStart(2, "0")} 可用片段`, meta: `${realDuration || shot.duration}秒 / ${shot.ratio.split(" ")[0]} / Seedance 2.0`, gradient: randomGradient(), videoUrl, providerTaskId: providerTaskId || existingTask?.providerTaskId };
      return { ...prev, shots: prev.shots.map(item => item.id === shotId ? { ...item, status: "done" } : item), tasks: prev.tasks.map(item => item.id === localTaskId ? { ...item, status: "done", result: "已生成，可预览下载" } : item), assets: [asset, ...prev.assets.filter(item => item.shotId !== shotId)] };
    });
  }

  function markGenerationFailed(shotId: number, localTaskId: string, message: string) {
    setState(prev => ({ ...prev, shots: prev.shots.map(item => item.id === shotId ? { ...item, status: "failed" } : item), tasks: prev.tasks.map(item => item.id === localTaskId ? { ...item, status: "failed", result: message } : item) }));
  }

  async function refreshTaskStatus(task: VideoTask) {
    if (!task.providerTaskId) {
      setUserActionMessage("这个任务没有后台任务 ID，无法同步。");
      return;
    }
    try {
      setUserActionMessage(`正在同步后台任务：${task.providerTaskId}`);
      const response = await fetch("/api/video-tasks/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task_id: task.providerTaskId, profile_id: activeApiProfile?.id, api_profile: publicApiProfile(activeApiProfile) }) });
      const result = await response.json();
      if (!response.ok || result.code !== 0 || !result.data) throw new Error(result.message || "同步任务状态失败");
      const data = result.data as { status: string; video_url?: string; duration?: number; error?: string };
      if (data.status === "succeeded" && data.video_url) {
        completeGeneration(task.shotId, task.id, data.video_url, data.duration, task.providerTaskId);
        setUserActionMessage("已从后台同步成功视频，任务状态已更新为完成。");
        return;
      }
      if (["pending", "submitted", "queued", "running", "processing"].includes(data.status)) {
        setState(prev => ({ ...prev, shots: prev.shots.map(item => item.id === task.shotId ? { ...item, status: "running" } : item), tasks: prev.tasks.map(item => item.id === task.id ? { ...item, status: "running", result: `生成中：${data.status}` } : item) }));
        setUserActionMessage(`后台任务仍在生成中：${data.status}`);
        return;
      }
      if (["failed", "error", "cancelled", "canceled"].includes(data.status)) {
        markGenerationFailed(task.shotId, task.id, data.error || "视频生成失败");
        setUserActionMessage(data.error || "后台任务仍显示失败。");
        return;
      }
      setUserActionMessage(`后台任务等待上游同步：${data.status || "unknown"}`);
    } catch (error) {
      setUserActionMessage(error instanceof Error ? error.message : "同步任务状态失败");
    }
  }

  function cleanupImportedBackendVideos() {
    setState(prev => {
      const importedProviderTaskIds = new Set(prev.tasks.filter(task => task.id.startsWith("imported-")).map(task => task.providerTaskId).filter(Boolean));
      return {
        ...prev,
        tasks: prev.tasks.filter(task => !task.id.startsWith("imported-")),
        assets: prev.assets.filter(asset => !asset.providerTaskId || !importedProviderTaskIds.has(asset.providerTaskId))
      };
    });
  }

  async function refreshAllTaskStatuses() {
    const tasks = state.tasks.filter(task => task.providerTaskId && !task.id.startsWith("imported-"));
    try {
      for (const task of tasks) await refreshTaskStatus(task);
      setUserActionMessage(tasks.length ? `已同步 ${tasks.length} 个生成任务。` : "没有可同步的生成任务。");
    } catch (error) {
      setUserActionMessage(error instanceof Error ? error.message : "同步本页任务状态失败");
    }
  }

  function deleteShot(shotId: number) {
    if (!confirm("确定删除这条分镜及相关任务、资产吗？")) return;
    setState(prev => ({ ...prev, shots: prev.shots.filter(shot => shot.id !== shotId), tasks: prev.tasks.filter(task => task.shotId !== shotId), assets: prev.assets.filter(asset => asset.shotId !== shotId) }));
  }

  function updateShotParams(shotId: number, patch: Partial<Pick<Shot, "ratio" | "duration" | "resolution" | "width" | "height">>) {
    setState(prev => ({ ...prev, shots: prev.shots.map(shot => shot.id === shotId ? { ...shot, ...patch } : shot) }));
  }

  function deleteTask(taskId: string) {
    setState(prev => {
      const target = prev.tasks.find(task => task.id === taskId);
      if (!target) return prev;
      const remainingTasks = prev.tasks.filter(task => task.id !== taskId);
      const hasOtherTaskForShot = remainingTasks.some(task => task.shotId === target.shotId);
      return {
        ...prev,
        shots: prev.shots.map(shot => shot.id === target.shotId && !hasOtherTaskForShot ? { ...shot, status: "pending" } : shot),
        tasks: remainingTasks,
        assets: prev.assets.filter(asset => asset.providerTaskId !== target.providerTaskId)
      };
    });
    setUserActionMessage("生成任务已删除，关联分镜已恢复为待生成。");
  }

  function deleteVideoAsset(assetId: number) {
    setState(prev => ({ ...prev, assets: prev.assets.filter(asset => asset.id !== assetId) }));
  }

  const filteredMaterials = state.materials.filter(material => activeAssetTab === "sd2" ? material.kind === "sd2" : material.kind === activeAssetTab);
  const hiddenAssetCount = Math.max(filteredMaterials.length - 5, 0);
  const visibleAssets = showAllAssets ? filteredMaterials : filteredMaterials.slice(0, 5);
  const hiddenImageResultCount = Math.max(generatedImages.length - 5, 0);
  const visibleImageResults = showAllImageResults ? generatedImages : generatedImages.slice(0, 5);
  const visibleShots = showAllShots ? state.shots : state.shots.slice(0, 5);
  const hiddenShotCount = Math.max(state.shots.length - 5, 0);
  const hiddenTaskCount = Math.max(state.tasks.length - 5, 0);
  const visibleTasks = showAllTasks ? state.tasks : state.tasks.slice(0, 5);
  const visibleVideoAssets = showAllVideoAssets ? state.assets : state.assets.slice(0, 5);
  const hiddenVideoAssetCount = Math.max(state.assets.length - 5, 0);
  const selectedProjectReferences = state.materials.filter(item => selectedMaterialIds.includes(item.id));
  const usableProjectReferences = selectedProjectReferences.filter(item => materialApiUrl(item));
  const localOnlyReferences = selectedProjectReferences.filter(item => !materialApiUrl(item));
  const selectedExternalReferences = lizhenAssets.filter(item => selectedLizhenAssetIds.includes(item.id));
  const omniReferenceItems = [
    ...usableProjectReferences.map(item => ({ id: `material-${item.id}`, name: item.name, kind: item.kind, url: materialApiUrl(item), previewUrl: item.previewUrl })),
    ...selectedExternalReferences.map(item => ({ id: `external-${item.id}`, name: item.asset_name, kind: item.类型, url: item.asset_url, previewUrl: "" }))
  ];
  function videoRecordForShot(shotId: number) {
    const asset = state.assets.find(item => item.shotId === shotId && item.videoUrl);
    const task = state.tasks.find(item => item.shotId === shotId && item.providerTaskId);
    return { asset, taskId: asset?.providerTaskId || task?.providerTaskId };
  }
  const filteredLizhenAssets = lizhenAssets.filter(asset => {
    const typeMatched = libraryFilter === "all" || (libraryFilter === "image" && asset.类型 === "图片") || (libraryFilter === "video" && asset.类型 === "视频") || (libraryFilter === "text" && asset.类型 === "音频");
    const keyword = librarySearch.trim().toLowerCase();
    const keywordMatched = !keyword || `${asset.asset_name} ${asset.asset_url} ${asset.类型} ${asset.资产状态}`.toLowerCase().includes(keyword);
    return typeMatched && keywordMatched;
  });
  const visibleLizhenAssets = showAllLizhenAssets ? filteredLizhenAssets : filteredLizhenAssets.slice(0, 5);
  const hiddenLizhenAssetCount = Math.max(filteredLizhenAssets.length - 5, 0);
  const currentUserRecord = currentUser ? authUsers[currentUser] : null;
  const currentUserRole = currentUserRecord?.role || "user";
  const currentUserCanManageMembers = canManageMembers(currentUserRole);
  const currentUserCanManageApiProfiles = canManageApiProfiles(currentUserRole);
  const memberRoleOptions = assignableRoles(currentUserRole);
  const currentApiKeys = currentUserRecord?.apiKeys || [];
  const activeApiProfile = apiProfiles.find(item => item.id === activeApiProfileId) || apiProfiles.find(item => item.active) || apiProfiles[0];
  const activeVideoModels = useMemo(() => activeApiProfile?.videoModels?.length ? activeApiProfile.videoModels : [activeApiProfile?.model || "doubao-seedance-2-0-fast-260128"].filter(Boolean), [activeApiProfile]);
  const activeImageModels = useMemo(() => activeApiProfile?.imageModels?.length ? activeApiProfile.imageModels : ["gpt-image-2", "seedream-3.0", "stable-image-ultra", "flux-pro"], [activeApiProfile]);
  const currentDisplayName = currentUserRecord?.displayName || currentUser || "访客";
  const avatarLabel = currentDisplayName.slice(0, 2).toUpperCase();
  const scriptTooLong = state.project.script.length > 220;
  const scriptPreview = showFullScript || !scriptTooLong ? state.project.script : `${state.project.script.slice(0, 220)}...`;

  useEffect(() => {
    if (activeVideoModels.length && !activeVideoModels.includes(selectedVideoModel)) setSelectedVideoModel(activeVideoModels[0]);
    if (activeImageModels.length && !activeImageModels.includes(imageModel)) setImageModel(activeImageModels[0]);
  }, [activeApiProfileId, apiProfiles, activeVideoModels, activeImageModels, selectedVideoModel, imageModel]);

  function resetDemo() {
    if (!confirm("确定重置为初始演示数据吗？")) return;
    const nextProjectStates = { [seedState.project.id]: seedState };
    const nextProjects = [seedState.project];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: seedState, projectStates: nextProjectStates, projects: nextProjects, currentProjectId: seedState.project.id }));
    setSelectedMaterialIds([]);
    setSelectedLizhenAssetIds([]);
    setGeneratedImages([]);
    setProjectStates(nextProjectStates);
    setProjects(nextProjects);
    setCurrentProjectId(seedState.project.id);
    setState(seedState);
  }

  function openPromptDialog() {
    setPromptDraft(shotPrompt || "请基于当前剧本和分镜，生成一个适合 Seedance 2.0 的中文/英文视频提示词。");
    setPromptModalOpen(true);
  }

  function saveGeneratedPrompt() {
    const text = promptDraft.trim();
    if (!text) return;
    setShotPrompt(text);
    const material: MaterialAsset = { id: Date.now(), name: "生成 Prompt", url: text, kind: "sd2", role: "reference_image" };
    setState(prev => ({ ...prev, materials: [material, ...prev.materials] }));
    setActiveAssetTab("sd2");
    setPromptModalOpen(false);
    setMaterialMessage("Prompt 已保存，并已同步到 SD2素材。注意：Prompt 会用于分镜提示词，不作为媒体 URL 传入。");
  }

  function openImageDialog() {
    setImagePromptDraft(shotPrompt || "角色参考图，电影感，精致细节，适合短剧分镜");
    setImageModalOpen(true);
  }

  function saveImagePlaceholder() {
    const text = imagePromptDraft.trim();
    if (!text) return;
    const material: MaterialAsset = { id: Date.now(), name: "待生成图片素材", url: "", kind: "image", role: "reference_image", previewUrl: "" };
    setState(prev => ({ ...prev, materials: [material, ...prev.materials] }));
    setActiveAssetTab("image");
    setImageModalOpen(false);
    setMaterialMessage(`已创建图片生成占位：${text}。后续可接入真实图片生成接口，或填入公网图片 URL 后用于视频生成。`);
  }


  function insertMention(material: MaterialAsset) {
    const token = `@${material.name}`;
    setShotPrompt(prev => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${token}`);
    if (material.previewUrl) setSelectedMaterialIds(prev => prev.includes(material.id) ? prev : [...prev, material.id]);
    setMentionMenuOpen(false);
  }

  function enrichShotPrompt() {
    const text = shotPrompt.trim();
    if (!text) {
      alert("请先输入提示词，再使用全能参考润色。");
      return;
    }
    setShotPrompt([
      text,
      "\n全能参考润色：真人写实短剧质感，电影级布光，镜头运动自然，人物表情细腻，动作连贯完整。",
      "画面要求：保持提示词中 @人物/素材 对应关系一致，参考素材中的脸型、发型、服装、年龄感和气质不要变化。",
      "生成要求：不要新增无关人物和场景，不要生成字幕，节奏适合短视频叙事，画面清晰稳定。"
    ].join("\n"));
  }

  function shotSizeForRatio(ratio: string): Pick<Shot, "width" | "height"> {
    const sizeMap: Record<string, Pick<Shot, "width" | "height">> = {
      "16:9 横屏": { width: 1280, height: 720 },
      "9:16 竖屏短剧": { width: 720, height: 1280 },
      "1:1 方屏": { width: 1024, height: 1024 },
      "4:3 宽屏": { width: 1792, height: 1024 },
      "3:4 长图": { width: 1024, height: 1792 },
      "adaptive 智能比例": {}
    };
    return sizeMap[ratio] || {};
  }

  function updateImageRatio(ratio: AspectRatio) {
    setImageRatio(ratio);
    const sizes: Record<AspectRatio, [number, number]> = {
      "1:1": [1024, 1024],
      "3:2": [1216, 832],
      "2:3": [832, 1216],
      "4:3": [1152, 896],
      "3:4": [896, 1152],
      "16:9": [1344, 768],
      "9:16": [768, 1344],
      auto: [1024, 1024]
    };
    const [width, height] = sizes[ratio];
    setImageWidth(width);
    setImageHeight(height);
  }

  function generateImages() {
    if (!imageWorkbenchPrompt.trim()) {
      alert("请先填写生图提示词。");
      return;
    }
    setIsImageGenerating(true);
    window.setTimeout(() => {
      const images = Array.from({ length: imageCount }).map((_, index) => ({
        id: Date.now() + index,
        name: `生图结果 ${index + 1}`,
        url: "",
        kind: "image" as MaterialKind,
        role: "reference_image" as MaterialRole,
        previewUrl: ""
      }));
      setGeneratedImages(images);
      setState(prev => ({ ...prev, materials: [...images, ...prev.materials] }));
      setActiveAssetTab("image");
      setIsImageGenerating(false);
      setMaterialMessage(`已生成 ${imageCount} 张图片占位。当前未接入真实生图 API，后续可将图片生成接口接到这里。`);
    }, 900);
  }

  async function submitAuth() {
    if (isLoggingIn) return;
    const account = loginAccount.trim();
    const password = loginPassword.trim();
    if (!account || !password) {
      setAuthMessage("请输入账号和密码。");
      return;
    }
    setIsLoggingIn(true);
    setAuthMessage("正在登录...");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, password })
      });
      const result = await response.json();
      if (!response.ok || result.code !== 0 || !result.data) {
        setAuthMessage(result.message || "登录失败。");
        return;
      }
      setAuthUsers(prev => ({ ...prev, [result.data.account]: result.data as AuthUser }));
      setCurrentUser(result.data.account);
      setShowLoginPage(false);
      setLoginPassword("");
      setAuthMessage("");
      fetchUsers().catch(() => undefined);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "登录请求失败，请确认本地服务和数据库已启动。");
    } finally {
      setIsLoggingIn(false);
    }
  }

  function switchLanguage() {
    const nextLanguage = languageLabel === "简体中文" ? "English" : "简体中文";
    setLanguageLabel(nextLanguage);
    setUserMenuOpen(false);
    setUserActionMessage(`语言已切换为 ${nextLanguage}`);
    if (typeof window !== "undefined") window.localStorage.setItem("manjing-language", nextLanguage);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setCurrentUser(null);
    setLoginPassword("");
    setUserMenuOpen(false);
    setAuthMessage("已退出登录，请重新登录。");
    setUserActionMessage("已退出登录，请重新登录。");
    setShowLoginPage(true);
  }

  if (showLoginPage) {
    return (
      <div className="login-shell">
        <section className="login-marketing">
          <div className="login-glow" />
          <div className="login-copy">
            <div className="login-brand"><div className="login-logo">漫</div>漫镜视频</div>
            <h1>一镜成片。<br />高效开拍。</h1>
            <p>让剧本、分镜、素材与 AI 生成汇入同一条创作管线，快速完成短剧视频生产。</p>
            <div className="login-tags"><span>团队协作</span><span>实时生成</span><span>智能分镜</span><span>专业管线</span></div>
          </div>
        </section>
        <section className="login-panel-wrap">
          <div className="login-card">
            <div className="login-card-logo">M</div>
            <h2>账号登录</h2>
            <div className="login-form">
              <label>账号</label>
              <div className="login-input"><input value={loginAccount} onChange={event => setLoginAccount(event.target.value)} placeholder="输入您的账号" /></div>
              <div className="login-label-row"><label>密码</label><button onClick={() => setAuthMessage("请联系管理员重置密码。")}>忘记密码?</button></div>
              <div className="login-input login-password-input"><input type={showLoginPassword ? "text" : "password"} value={loginPassword} onChange={event => setLoginPassword(event.target.value)} placeholder="输入您的密码" onKeyDown={event => { if (event.key === "Enter") submitAuth(); }} /><button type="button" aria-label={showLoginPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowLoginPassword(visible => !visible)}>{showLoginPassword ? "◉" : "◎"}</button></div>
              {authMessage && <p className="login-message">{authMessage}</p>}
              <button type="button" className="login-submit" onClick={submitAuth} disabled={isLoggingIn}>{isLoggingIn ? "正在进入..." : "进入工作空间"} <span>→</span></button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="app">
      <aside>
        <div className="brand"><div className="logo">漫</div>漫镜视频</div>
        <button className="workspace" onClick={() => setProjectSwitcherOpen(open => !open)}>
          <small>当前项目 · 点击切换</small>
          <strong>{state.project.name}</strong>
          <span>{state.project.type} ▾</span>
        </button>
        {projectSwitcherOpen && <div className="project-list project-list-floating">
          <small>选择项目</small>
          {projects.map(project => (
            <button key={project.id} className={project.id === currentProjectId ? "active" : ""} onClick={() => switchProject(project)}>
              <span>{project.name}</span>
              <em>{project.type}</em>
            </button>
          ))}
        </div>}
        <nav className="workspace-nav">
          <div className="nav-group-label">工作台</div>
          {([
            ["project-home", "⌂ 项目首页"],
            ["overview", "▦ 项目概览"],
            ["script", "▤ 剧本工作台"],
            ["image-workbench", "▧ 生图工作台"],
            ["shots", "▥ 视频工作台"],
            ["material-assets", "◈ 项目素材库"],
            ["tasks", "◎ 生成任务"],
            ["generated-videos", "◉ 已生成视频"],
            ["assets", "◫ 外接资产库"]
          ] as [WorkspaceSection, string][]).map(([section, label]) => (
            <button key={section} className={activeSection === section ? "active" : ""} onClick={() => setActiveSection(section)}>{label}</button>
          ))}
          {(currentUserCanManageMembers || currentUserCanManageApiProfiles) && <div className="nav-group-label">设置与管理</div>}
          {([
            ...(currentUserCanManageMembers ? [["members", "▤ 人员管理"] as [WorkspaceSection, string]] : []),
            ...(currentUserCanManageApiProfiles ? [["channel-management", "◎ 模型渠道管理"] as [WorkspaceSection, string]] : [])
          ] as [WorkspaceSection, string][]).map(([section, label]) => (
            <button key={section} className={activeSection === section ? "active" : ""} onClick={() => setActiveSection(section)}>{label}</button>
          ))}
        </nav>
      </aside>

      <main>
        <div className="topbar"><div className="crumb">漫镜视频 / AI 短剧生产平台</div><div className="actions"><button className="btn-secondary" onClick={refreshAllTaskStatuses}>同步本页任务状态</button><div className="user-menu-wrap"><button className="user-chip" onClick={() => setUserMenuOpen(open => !open)}><strong>{currentDisplayName}</strong><span>{roleLabel(currentUserRole)}</span></button>{userMenuOpen && <div className="user-menu"><strong>{currentDisplayName}</strong><small>{currentUserRecord?.account || "-"}</small><small>{roleLabel(currentUserRole)}</small><button onClick={() => { setActiveSection("profile"); setProfileSection("basic"); setMemberNameDraft(currentDisplayName); setUserMenuOpen(false); }}>个人中心</button><button onClick={() => { setActiveSection("assets"); setUserMenuOpen(false); }}>我的资产</button><button onClick={switchLanguage}>语言 · {languageLabel}</button><button onClick={logout} className="danger">退出登录</button></div>}</div></div></div>
        {userActionMessage && <div className="action-toast">{userActionMessage}</div>}
        {(["shots", "tasks", "generated-videos"] as WorkspaceSection[]).includes(activeSection) && <div className="notice">真实 API 说明<span>已接入 Seedance 2.0。文生视频可直接生成；图生/参考素材生成需要公网 URL 或登记后的 asset://id，本地文件仅支持页面预览。</span></div>}
        <section id="project-home" className="project-home card" style={sectionStyle("project-home")}>
          <div className="project-home-head">
            <div><h2>项目首页</h2><p className="muted">选择一个项目进入编辑，或新建一个空白测试项目。</p></div>
            <button className="btn-primary" onClick={() => { setProjectName(""); setProjectType("都市短剧"); setProjectModalOpen(true); }}>新建项目</button>
          </div>
          <div className="project-home-grid">
            {projects.map(project => {
              const itemState = projectStates[project.id];
              return <button key={project.id} className={`project-home-card ${project.id === currentProjectId ? "active" : ""}`} onClick={() => switchProject(project)}>
                <span>{project.id === currentProjectId ? "当前编辑" : "点击进入"}</span>
                <strong>{project.name}</strong>
                <em>{project.type}</em>
                <small>{itemState?.shots.length || 0} 条分镜 · {itemState?.materials.length || 0} 个素材</small>
              </button>;
            })}
          </div>
        </section>

        <section id="overview" className="grid hero" style={sectionStyle("overview")}>
          <div className="card project-card"><div><div className="pills"><span className="pill green">{stats.total === stats.done && stats.total > 0 ? "项目可交付" : "项目制作中"}</span><span className="pill">{stats.running ? "当前阶段：视频生成" : "当前阶段：分镜生成"}</span><span className="pill">面向：短剧团队</span></div><h1 className="big">{stats.percent}%</h1><p className="muted">{stats.total ? `已完成 ${stats.done} 条分镜视频生成，共 ${stats.total} 条分镜。` : "开始添加分镜后，系统会按已完成视频自动计算进度。"}</p><div className="progress"><b style={{ width: `${stats.percent}%` }} /></div></div><div className="delivery">项目可交付进度<strong>{stats.done}/{stats.total}</strong><p className="muted">按可用视频片段统计</p></div></div>
          <div className="stats"><div className="stat"><span>可导出分镜</span><strong>{stats.done}/{stats.total}</strong></div><div className="stat"><span>视频总片段</span><strong>{stats.total}</strong></div><div className="stat"><span>已完成视频</span><strong>{stats.done}</strong></div><div className="stat"><span>预计总时长</span><strong>{stats.totalDuration}秒</strong></div></div>
        </section>

        <div style={sectionStyle("overview")}>
          <h2>阶段进度</h2><p className="section-desc">每个阶段都围绕短剧团队从剧本到视频交付的主流程设计。</p>
          <section className="grid steps"><div className="card step"><span className="status">{state.project.script ? "已完成" : "待开始"}</span><div className="step-icon" style={{ background: "#eef2ff", color: "var(--blue)" }}>▤</div><h3>内容准备</h3><strong>{state.project.script ? "完成" : "待开始"}</strong><p className="muted">导入项目大纲与基础设定。</p></div><div className="card step"><span className="status">{state.materials.length ? "进行中" : "待开始"}</span><div className="step-icon" style={{ background: "#eef2ff", color: "var(--primary)" }}>◈</div><h3>素材准备</h3><strong>{state.materials.length}个</strong><p className="muted">添加参考图、视频或音频。</p></div><div className="card step"><span className="status">{stats.running ? "进行中" : stats.done ? "已完成" : "待开始"}</span><div className="step-icon" style={{ background: "#f5f3ff", color: "var(--purple)" }}>◎</div><h3>视频生成</h3><strong>{stats.done}/{stats.total}</strong><p className="muted">调用 Seedance 2.0 真实任务。</p></div><div className="card step"><span className="status">{stats.done ? "进行中" : "待开始"}</span><div className="step-icon" style={{ background: "#fff7ed", color: "var(--orange)" }}>◫</div><h3>资产筛选</h3><strong>{stats.done}个资产</strong><p className="muted">筛选可用片段并归档。</p></div><div className="card step"><span className="status">{stats.total && stats.done === stats.total ? "已就绪" : "待开始"}</span><div className="step-icon" style={{ background: "#eef2ff", color: "var(--primary)" }}>⇩</div><h3>交付导出</h3><strong>{stats.total && stats.done === stats.total ? "可导出" : "待开始"}</strong><p className="muted">下载真实生成视频。</p></div></section>
          <section className="overview-dashboard">
            <div className="overview-mini-card"><h3>△ 当前阻塞</h3><div className="soft-note">{stats.running ? "仍有视频任务生成中，请等待任务完成后再导出。" : "当前没有阻塞项，继续补齐剩余视频即可。"}</div></div>
            <div className="overview-mini-card"><h3>⊙ 下一步建议</h3><div className="next-suggestion"><strong>{state.project.script ? "继续完善素材，再追踪交付" : "先导入内容，再开始追踪交付"}</strong><p className="muted">上传剧本后，系统才能生成分集并建立首页进度看板。</p><span>完成后首页会开始展示粗剪与真实视频进度。</span><button className="btn-primary btn-small" onClick={() => setActiveSection("script")}>前往剧本 →</button></div></div>
            <div className="overview-delivery card"><div className="card-title-row"><div><h2>分集交付看板</h2><p className="muted">每集直接显示真实视频覆盖率、缺口数量和当前状态，不再用分镜完成度代替交付进度。</p></div><span className="source-pill internal">共 {stats.total} 集，已可导出 {stats.done} 集</span></div></div>
            <div className="overview-trend card"><div className="card-title-row"><h2>活动趋势</h2><span className="muted">最近30天</span></div><div className="trend-chart">{Array.from({ length: 12 }).map((_, index) => <i key={index} style={{ height: `${20 + ((index + stats.done) % 5) * 18}px` }} />)}</div><div className="trend-axis"><span>5.17</span><span>5.23</span><span>5.29</span><span>6.4</span><span>6.10</span><span>6.14</span></div></div>
            <div className="overview-collab card"><h2>协作总览</h2><p><strong>当前编辑中</strong><span>{currentDisplayName || "暂无人在编辑"}</span></p><p><strong>最近操作</strong><span>{state.tasks[0]?.result || "暂无操作记录"}</span></p></div>
          </section>
        </div>

        <section className="card" style={sectionStyle("members")}>
          <div className="asset-workspace-head"><div><h2>人员管理</h2><p className="muted">系统管理员管理平台配置；管理员维护本租户成员；用户负责日常生产操作。</p></div><button className="btn-primary" onClick={openNewMemberEditor} disabled={!currentUserCanManageMembers}>新增人员</button></div>
          <div className="member-role-grid"><div className="member-role-card"><strong>系统管理员</strong><p>产品提供商最高权限，管理平台 API 配置和后续租户能力。</p></div><div className="member-role-card"><strong>管理员</strong><p>租户管理员，维护本租户成员和团队生产流程。</p></div><div className="member-role-card"><strong>用户</strong><p>使用剧本、素材、分镜、视频生成和资产查看功能。</p></div></div>
          <div className="table-wrap" style={{ marginTop: 18 }}><table className="table"><thead><tr><th>账号</th><th>显示名</th><th>角色</th><th>状态</th><th>权限范围</th><th>操作</th></tr></thead><tbody>{Object.values(authUsers).map(user => <tr key={user.account}><td>{user.account}</td><td>{user.displayName || user.account}</td><td>{roleLabel(user.role)}</td><td><span className={user.status === "active" ? "tag done" : "tag pending"}>{user.status === "active" ? "启用" : "停用"}</span></td><td>{roleScope(user.role)}</td><td><button className="btn-ghost btn-small" disabled={!currentUserCanManageMembers || !canManageTargetMember(currentUserRole, user.role) || user.status !== "active"} onClick={() => openEditMemberEditor(user)}>编辑</button><button className={user.status === "active" ? "btn-danger btn-small" : "btn-ghost btn-small"} disabled={!currentUserCanManageMembers || !canManageTargetMember(currentUserRole, user.role) || (user.account === currentUser && user.status === "active")} onClick={() => updateMemberStatus(user.account, user.status === "active" ? "disabled" : "active")}>{user.status === "active" ? "停用" : "启用"}</button></td></tr>)}</tbody></table></div>
          {memberEditorOpen && <div className="api-profile-panel">
            <div className="asset-workspace-head"><div><h2>{editingMemberAccount ? "编辑人员" : "新增人员"}</h2><p className="muted">新人员需要设置初始密码；编辑已有人员时密码可留空。</p></div><button className="btn-ghost btn-small" onClick={closeMemberEditor}>取消</button></div>
            <div className="script-core-grid"><div><label>成员账号</label><input value={memberAccountDraft} disabled={Boolean(editingMemberAccount)} onChange={event => setMemberAccountDraft(event.target.value)} placeholder="例如 zhangsan" /></div><div><label>显示名称</label><input value={memberNameDraft} onChange={event => setMemberNameDraft(event.target.value)} placeholder="输入显示名称" /></div><div><label>初始/重置密码</label><input type="password" value={memberPasswordDraft} onChange={event => setMemberPasswordDraft(event.target.value)} placeholder="新成员必填；编辑成员可留空" /></div><div><label>成员角色</label><select value={memberRoleDraft} onChange={event => setMemberRoleDraft(event.target.value as MemberRole)}>{memberRoleOptions.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></div></div>
            <div className="actions"><button className="btn-primary" onClick={upsertMember} disabled={!currentUserCanManageMembers}>保存人员</button><button className="btn-ghost" onClick={closeMemberEditor}>取消</button></div>
          </div>}
        </section>

        <section className="card" style={sectionStyle("channel-management")}>
          <div className="asset-workspace-head"><div><h2>模型渠道管理</h2><p className="muted">管理第三方中转或官方接口的调用渠道、模型 ID 和并发限制。</p></div><button className="btn-primary" onClick={openNewApiProfileEditor}>新增渠道</button></div>
          {userActionMessage && <div className="api-active-banner">{userActionMessage}<small>{activeApiProfile?.name || ""}</small></div>}
          <div className="table-wrap" style={{ marginTop: 14 }}><table className="table"><thead><tr><th>状态</th><th>渠道</th><th>Base URL</th><th>视频模型</th><th>图片模型</th><th>并发</th><th>Key</th><th>操作</th></tr></thead><tbody>{apiProfiles.length ? apiProfiles.map(profile => <tr key={profile.id}><td>{profile.id === activeApiProfileId ? <span className="tag done">当前使用</span> : <span className="tag pending">备用</span>}</td><td>{profile.name}</td><td><code>{profile.baseUrl}</code></td><td>{profile.videoModels.length}</td><td>{profile.imageModels.length}</td><td>{profile.concurrencyLimit || 1}</td><td><span className={profile.hasApiKey ? "tag done" : "tag pending"}>{profile.hasApiKey ? "已隐藏" : "未配置"}</span></td><td><div className="table-actions"><button onClick={() => openEditApiProfileEditor(profile)}>编辑</button>{profile.id !== activeApiProfileId && <button onClick={() => switchApiProfile(profile.id)}>设为当前</button>}<button className="danger" onClick={() => deleteApiProfile(profile.id)}>删除</button></div></td></tr>) : <tr><td colSpan={8}><div className="empty">暂无模型渠道，请新增渠道后再进行视频或图片生成。</div></td></tr>}</tbody></table></div>
          {apiProfileEditorOpen && <div className="api-profile-panel">
            <div className="asset-workspace-head"><div><h2>{addingApiProfile ? "新增渠道" : "编辑渠道"}</h2><p className="muted">API Key 留空时会保留原密钥；视频和图片模型 ID 一行一个。</p></div><button className="btn-ghost btn-small" onClick={closeApiProfileEditor}>取消</button></div>
            <div className="script-core-grid"><div><label>渠道名称</label><input value={apiProfileName} onChange={event => setApiProfileName(event.target.value)} /></div><div><label>API Base URL</label><input value={apiProfileBaseUrl} onChange={event => updateApiProfileDraft("baseUrl", event.target.value)} /></div><div><label>API Key</label><input type="password" autoComplete="new-password" value={apiProfileKey} onChange={event => updateApiProfileDraft("apiKey", event.target.value)} placeholder="保存后自动隐藏" /></div><div><label>并发数</label><input type="number" min={1} max={50} value={apiProfileConcurrencyLimit} onChange={event => setApiProfileConcurrencyLimit(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} /></div></div>
            <div className="script-core-grid"><div><label>视频模型 ID</label><textarea value={apiProfileVideoModels} onChange={event => setApiProfileVideoModels(event.target.value)} /></div><div><label>图片模型 ID</label><textarea value={apiProfileImageModels} onChange={event => setApiProfileImageModels(event.target.value)} /></div></div>
            <div className="actions"><button className="btn-primary" onClick={saveApiProfile}>保存渠道</button><button className="btn-ghost" onClick={closeApiProfileEditor}>取消</button></div>
          </div>}
        </section>

        <section className="profile-layout" style={sectionStyle("profile")}>
          <aside className="profile-side"><div className="profile-user-card"><div className="profile-avatar">{avatarLabel}</div><strong>{currentDisplayName}</strong><span>{currentUserRecord?.account || "-"}</span><small>{roleLabel(currentUserRole)}</small></div><button className={profileSection === "basic" ? "active" : ""} onClick={() => setProfileSection("basic")}>基础信息</button><button className={profileSection === "security" ? "active" : ""} onClick={() => setProfileSection("security")}>账户安全</button><button className={profileSection === "api" ? "active" : ""} onClick={() => setProfileSection("api")}>API 密钥</button></aside>
          <div className="profile-content">{profileSection === "basic" && <section className="card profile-panel"><h2 style={{ marginTop: 0 }}>基础信息</h2><p className="muted">您的个人资料信息</p><div className="profile-info-list"><div><span>账号</span><strong>{currentUserRecord?.account || "-"}</strong></div><div><span>邮箱</span><strong>{currentUserRecord?.email || "-"}</strong></div><div><span>创建时间</span><strong>{currentUserRecord?.createdAt ? new Date(currentUserRecord.createdAt).toLocaleDateString() : "-"}</strong></div><div><span>角色</span><strong>{roleLabel(currentUserRole)}</strong></div></div><div className="form" style={{ marginTop: 16 }}><div><label>显示名称</label><input value={memberNameDraft} onChange={event => setMemberNameDraft(event.target.value)} placeholder="输入新的显示名称" /></div><div className="actions"><button className="btn-primary" onClick={saveProfile}>修改个人信息</button></div></div></section>}{profileSection === "security" && <section className="card profile-panel"><h2 style={{ marginTop: 0 }}>账户安全</h2><p className="muted">管理您的安全设置</p><div className="security-list"><div><span>账户状态</span><strong className="ok">{currentUserRecord?.status === "active" ? "正常" : "停用"}</strong></div><div><span>重置密码</span><button className="btn-ghost" onClick={() => setPasswordModalOpen(true)}>修改密码</button></div></div></section>}{profileSection === "api" && <section className="card profile-panel"><div className="card-title-row"><div><h2 style={{ marginTop: 0 }}>API 密钥</h2><p className="muted">管理您的 API 访问密钥，用于通过 API 调用平台功能</p></div><button className="btn-primary" onClick={createApiKey}>+ 创建密钥</button></div>{currentApiKeys.length ? <div className="table-wrap"><table className="table"><thead><tr><th>名称</th><th>密钥</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{currentApiKeys.map(item => <tr key={item.id}><td>{item.name}</td><td><code>{item.value}</code></td><td>{new Date(item.createdAt).toLocaleDateString()}</td><td><button className="btn-danger btn-small" onClick={() => deleteApiKey(item.id)}>删除</button></td></tr>)}</tbody></table></div> : <div className="empty-result"><div className="empty-ico">⌘</div><strong>暂无 API 密钥</strong><p className="muted">个人 API Key 将在账号体系稳定后接入服务端存储。</p></div>}</section>}</div>
        </section>

        <section id="script" className="card script-workbench" style={sectionStyle("script")}>
          <div className="asset-workspace-head"><div><h2>剧本工作台</h2><p className="muted">围绕核心要素生成初稿，优化对话逻辑与情节连贯性，并对长剧本输出大纲和单集拆分。</p></div><span className="source-pill internal">剧本策划</span></div>
          <div className="form">
            <div className="script-core-grid"><div><label>主题</label><input value={scriptTheme} onChange={event => setScriptTheme(event.target.value)} placeholder="例如：豪门复仇、都市逆袭、校园暗恋" /></div><div><label>角色</label><input value={scriptCharacters} onChange={event => setScriptCharacters(event.target.value)} placeholder="例如：女主、男主、反派、关键配角" /></div><div><label>风格</label><select value={scriptStyle} onChange={event => setScriptStyle(event.target.value)}><option>都市情感</option><option>悬疑反转</option><option>轻喜甜宠</option><option>豪门复仇</option><option>现实主义</option></select></div><div><label>集数</label><input type="number" min={1} value={scriptEpisodeCount} onChange={event => setScriptEpisodeCount(Number(event.target.value) || 1)} /></div></div>
            <div className="actions"><button className="btn-primary" onClick={generateScriptDraft}>生成初稿</button><button className="btn-ghost" onClick={optimizeScriptFlow}>优化对话逻辑 / 情节连贯性</button><button className="btn-ghost" onClick={splitScriptToOutlineAndEpisodes}>生成大纲 / 单集拆分</button></div>
            <div><label>上传剧本文件</label><input type="file" accept=".txt,.md,.doc,.docx" onChange={event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = loadEvent => setScriptInput(String(loadEvent.target?.result || "")); reader.readAsText(file); }} /></div>
            <div><label>剧本内容</label><textarea className="batch-prompt" value={scriptInput} onChange={event => setScriptInput(event.target.value)} placeholder="可先通过上方核心要素生成初稿，也可以直接上传/粘贴大段剧本内容。" /></div>
            <div className="actions"><button className="btn-primary" onClick={saveScript}>保存剧本</button></div>
            {!!scriptOptimizationNote && <div className="batch-preview"><strong>处理结果</strong><p>{scriptOptimizationNote}</p></div>}
            {!!scriptOutline && <div className="script-box">{scriptOutline}</div>}
            {!!scriptEpisodeSplit && <div className="script-box">{scriptEpisodeSplit}</div>}
            <div className="script-box">{scriptPreview || "暂无剧本内容"}</div>
            {scriptTooLong && <button className="collapse-toggle" onClick={() => setShowFullScript(prev => !prev)}>{showFullScript ? "收起" : "展开全部剧本"}</button>}
          </div>
        </section>

        <section id="shots" className="video-studio" style={sectionStyle("shots")}>
          <div className="video-composer">
            <div className="video-composer-head">
              <div>
                <h2>视频工作台</h2>
                <p>输入完整视频提示词，使用 @ 绑定素材人物，点击右侧箭头生成视频。</p>
              </div>
              <button className="btn-ghost btn-small" onClick={() => setBatchModalOpen(true)}>批量导入提示词</button>
            </div>
            <div className="video-selected-assets">
              {state.materials.filter(material => selectedMaterialIds.includes(material.id) && material.kind === "image").slice(0, 5).map(material => <div key={material.id} className="video-selected-thumb"><button className="selected-thumb-remove" onClick={() => toggleMaterial(material.id)}>×</button>{material.previewUrl ? <img src={material.previewUrl} alt={material.name} /> : <span>{material.name.slice(0, 1)}</span>}</div>)}
              <button className="video-add-ref" onClick={() => setMentionMenuOpen(open => !open)}>+</button>
            </div>
            <textarea className="video-prompt-editor" value={shotPrompt} onChange={event => setShotPrompt(event.target.value)} placeholder="描述视频内容，可点击 @ 选择素材库图片并插入人物名称，例如：@林凡 在教室门口回头，镜头缓慢推进。" />
            {omniReferenceEnabled && <div className="omni-reference-panel"><div className="omni-reference-head"><span className="live-dot" /><strong>全能参考模式已开启</strong><em>{omniReferenceItems.length ? `${omniReferenceItems.length} 个真实参考素材将随视频任务提交` : "等待绑定真实参考素材"}</em></div><div className="omni-reference-strip">{omniReferenceItems.length ? omniReferenceItems.map((item, index) => <div className="omni-ref-chip" key={item.id}>{item.previewUrl ? <img src={item.previewUrl} alt={item.name} /> : <span>{String(item.kind).slice(0, 2)}</span>}<b>参考{index + 1}</b><small>{item.name}</small></div>) : <div className="omni-empty">请点击 @ 选择公网/asset:// 素材，或到外接资产库勾选真实资产。</div>}</div>{localOnlyReferences.length > 0 && <p className="omni-warning">已忽略 {localOnlyReferences.length} 个本地预览素材；本地文件无法被真实 API 读取。</p>}</div>}
            {mentionMenuOpen && <div className="video-mention-popover"><div className="mention-panel-head"><strong>可能@的内容</strong><span>点击素材插入到提示词；仅公网 URL 或 asset:// 会真实传给 API</span></div><div className="mention-panel-list">{mentionMaterials.length ? mentionMaterials.map(material => { const usable = Boolean(material.reviewedAssetUrl || material.seedanceAssetUrl || material.url); const selected = selectedMaterialIds.includes(material.id); return <div key={material.id} className={`mention-item ${selected ? "selected" : ""}`}><button onClick={() => insertMention(material)}><div className="mention-thumb">{material.previewUrl ? <img src={material.previewUrl} alt={material.name} /> : <span>@</span>}</div><div className="mention-meta"><strong>{material.name}</strong><span>{usable ? "可用于真实生成" : "仅本地预览，真实生成不会使用"}</span></div></button><button className="btn-ghost btn-small" onClick={() => toggleMaterial(material.id)}>{selected ? "取消@" : "选择"}</button><button className="btn-danger btn-small" onClick={() => deleteMaterial(material.id)}>删除</button></div>; }) : <div className="mention-empty">素材库里还没有图片素材，请先上传图片。</div>}</div></div>}
            <div className="video-composer-toolbar">
              <button className={`tool-chip primary ${omniReferenceEnabled ? "active" : ""}`} onClick={() => setOmniReferenceEnabled(enabled => !enabled)}>✦ 全能参考{omniReferenceEnabled ? "已开" : ""}</button>
              <label className="tool-select">模型<select value={selectedVideoModel} onChange={event => setSelectedVideoModel(event.target.value)}>{activeVideoModels.map(model => <option key={model} value={model}>{model}</option>)}</select></label>
              <label className="tool-select">▯<select value={shotRatio} onChange={event => setShotRatio(event.target.value)}><option>9:16 竖屏短剧</option><option>16:9 横屏</option><option>1:1 方屏</option><option>4:3 宽屏</option><option>3:4 长图</option><option>adaptive 智能比例</option></select></label>
              <label className="tool-select">清晰度<select value={shotResolution} onChange={event => setShotResolution(event.target.value as Shot["resolution"])}><option value="480p">480P</option><option value="720p">720P</option><option value="1080p">1080P</option></select></label>
              <label className="tool-select">◷<select value={shotDuration} onChange={event => setShotDuration(Number(event.target.value))}><option value="4">4s</option><option value="5">5s</option><option value="6">6s</option><option value="8">8s</option><option value="10">10s</option><option value="12">12s</option><option value="15">15s</option></select></label>
              <button className="tool-chip" onClick={() => setMentionMenuOpen(open => !open)}>@</button>
              <span className="tool-count">✦ {shotPrompt.length}</span>
              <button className="video-generate-arrow" onClick={() => addShot()}>↑</button>
            </div>
          </div>

          <div className="video-shot-list card">
            <div className="card-title-row"><h2 style={{ marginTop: 0 }}>视频生成记录</h2><span className="muted">{state.shots.length} 条视频</span></div>
            <div className="table-wrap"><table className="table"><thead><tr><th>镜头</th><th>画面内容</th><th>参数</th><th>状态</th><th>视频</th><th>操作</th></tr></thead><tbody>{visibleShots.length ? visibleShots.map((shot, index) => { const record = videoRecordForShot(shot.id); const expandedContent = expandedShotContentIds.includes(shot.id); const shouldCollapseContent = shot.prompt.length > 90; const displayPrompt = shouldCollapseContent && !expandedContent ? `${shot.prompt.slice(0, 90)}...` : shot.prompt; return <tr key={shot.id}><td>#{String(index + 1).padStart(2, "0")}</td><td><div className="shot-content-cell"><strong>{shot.title}</strong><span className="muted">{displayPrompt}</span>{shouldCollapseContent && <button className="text-toggle" onClick={() => setExpandedShotContentIds(prev => prev.includes(shot.id) ? prev.filter(id => id !== shot.id) : [...prev, shot.id])}>{expandedContent ? "收起" : "展开全部"}</button>}</div></td><td>{shot.ratio} / {shot.resolution || "720p"} / {shot.duration}s</td><td>{taskStatusTag(shot.status)}</td><td>{record.asset?.videoUrl ? <div className="record-video-box"><video src={proxiedVideoUrl(record.asset.videoUrl, false, record.taskId, activeApiProfile)} controls preload="metadata" /><div className="task-video-actions"><a href={proxiedVideoUrl(record.asset.videoUrl, false, record.taskId, activeApiProfile)} target="_blank" rel="noreferrer">预览</a><a href={proxiedVideoUrl(record.asset.videoUrl, true, record.taskId, activeApiProfile)}>下载</a></div></div> : <span className="muted">{shot.status === "done" ? "请同步本页任务状态" : "生成后可预览"}</span>}</td><td>{shot.status !== "running" && <button className="btn-primary btn-small" onClick={() => generateShotOrSplit(shot)}>{shot.status === "done" ? "重生成" : "生成"}</button>}<button className="btn-danger btn-small" onClick={() => deleteShot(shot.id)}>删除</button></td></tr>; }) : <tr><td colSpan={6}><div className="empty">暂无视频，输入提示词后点击右侧箭头开始生成。</div></td></tr>}</tbody></table></div>
            {hiddenShotCount > 0 && <button className="collapse-toggle" onClick={() => setShowAllShots(prev => !prev)}>{showAllShots ? "收起" : `展开全部 ${hiddenShotCount}`}</button>}
          </div>
        </section>

        <section id="image-workbench" className="image-workbench card" style={sectionStyle("image-workbench")}>
          <div className="image-head"><div><h2>生图工作台</h2><p className="muted">填写提示词、选择模型与尺寸，生成图片素材后可用于视频生成参考。</p></div><div className="actions"><button className="btn-ghost btn-small" onClick={() => alert("生成记录功能已预留")}>记录</button><button className="btn-ghost btn-small" onClick={() => alert("参数面板已在当前页面展开")}>参数</button></div></div>
          <div className="image-form-block"><label>提示词</label><div className="image-prompt-tools"><button className="btn-ghost btn-small" onClick={() => setImageWorkbenchPrompt(shotPrompt)}>复用当前分镜提示词</button><button className="btn-ghost btn-small" onClick={() => setImageWorkbenchPrompt("电影感角色参考图，精致五官，统一服装设定，干净背景，适合短剧分镜制作")}>套用示例</button></div><textarea className="image-prompt" value={imageWorkbenchPrompt} onChange={event => setImageWorkbenchPrompt(event.target.value)} placeholder="描述画面主体、风格、构图、光线和用途" /></div>
          <div className="image-form-block"><label>参考图</label><div className="reference-box"><span>暂无参考图</span><input type="file" accept="image/*" onChange={addLocalPreview} /><button className="btn-ghost btn-small" onClick={() => document.getElementById("material-assets")?.scrollIntoView({ behavior: "smooth" })}>去素材库选择</button></div></div>
          <div className="image-settings-grid"><div><label>模型</label><select value={imageModel} onChange={event => setImageModel(event.target.value)}>{activeImageModels.map(model => <option key={model} value={model}>{model}</option>)}</select></div><div><label>质量</label><div className="segmented">{(["auto", "high", "medium", "low"] as ImageQuality[]).map(item => <button key={item} className={imageQuality === item ? "active" : ""} onClick={() => setImageQuality(item)}>{item === "auto" ? "自动" : item === "high" ? "高" : item === "medium" ? "中" : "低"}</button>)}</div></div><div><label>尺寸</label><div className="size-row"><input type="number" value={imageWidth} onChange={event => setImageWidth(Number(event.target.value))} /><span>×</span><input type="number" value={imageHeight} onChange={event => setImageHeight(Number(event.target.value))} /></div></div></div>
          <div className="image-form-block"><label>宽高比</label><div className="ratio-grid">{(["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "auto"] as AspectRatio[]).map(item => <button key={item} className={imageRatio === item ? "active" : ""} onClick={() => updateImageRatio(item)}><span className="ratio-icon">▭</span>{item}</button>)}</div></div>
          <div className="image-form-block"><label>生成张数</label><div className="count-grid">{[1,2,3,4,5,6,7,8,9,10].map(count => <button key={count} className={imageCount === count ? "active" : ""} onClick={() => setImageCount(count)}>{count} 张</button>)}</div></div>
          <button className="btn-primary image-generate" disabled={isImageGenerating} onClick={generateImages}>{isImageGenerating ? "生成中..." : "开始生成"}</button>
          <div className="image-results"><h2>生成结果</h2>{visibleImageResults.length ? <div className="material-grid">{visibleImageResults.map(item => <div className="material-card" key={item.id}><div className="material-preview"><span>图片占位</span></div><strong>{item.name}</strong><p className="muted">{imageModel} / {imageQuality} / {imageRatio}</p></div>)}</div> : <div className="empty-result"><div className="empty-ico">▧</div><strong>还没有生成图片</strong><p className="muted">填写提示词并点击“开始生成”后，结果会展示在这里。</p></div>}{hiddenImageResultCount > 0 && <button className="collapse-toggle" onClick={() => setShowAllImageResults(prev => !prev)}>{showAllImageResults ? "收起" : `展开全部 ${hiddenImageResultCount}`}</button>}</div>
        </section>

        <div style={sectionStyle("material-assets")}>
        <div className="lizhen-select-tip">
          <div><strong>要使用外接资产生成视频？</strong><p>项目素材库用于管理本项目内的 Prompt、本地预览和公网素材；外接资产库用于管理真实可被 API 调用的 asset:// 第三方资产。</p></div>
          <button className="btn-primary" onClick={() => { setActiveSection("assets"); window.setTimeout(() => document.getElementById("assets")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }}>去勾选外接资产</button>
        </div>
        <section className="card asset-dynamic-workspace">
          <div className="asset-workspace-head"><div><h2>项目素材库</h2><p className="muted">管理当前项目内的 Prompt、本地预览素材和可登记的公网素材；默认展示最近 5 个，展开后查看全部。</p></div><span className="source-pill internal">项目内素材</span></div>
          <div className="asset-tabs">
            {([
              ["image", "图片"],
              ["video", "视频"],
              ["audio", "音频"],
              ["sd2", "SD2素材"]
            ] as const).map(([key, label]) => (
              <button key={key} className={activeAssetTab === key ? "active" : ""} onClick={() => setActiveAssetTab(key)}>{label}</button>
            ))}
          </div>
          <div className="asset-filterbar">
            <button className="btn-ghost btn-small" onClick={openPromptDialog}>生成 Prompt</button>
            <button className="btn-ghost btn-small" onClick={openImageDialog}>生成图片</button>
            <select onChange={event => alert(`已切换到：${event.target.value}`)}><option>全部集数</option><option>第 1 集</option><option>第 2 集</option></select>
            <select onChange={event => alert(`筛选：${event.target.value}`)}><option>全部</option><option>已选中</option><option>已登记 asset</option></select>
            <input placeholder="搜索资产名称..." onChange={event => setMaterialMessage(event.target.value ? `正在搜索：${event.target.value}` : "")} />
            <span className="muted" style={{ marginLeft: "auto" }}>排序</span>
            <select onChange={event => alert(`排序方式：${event.target.value}`)}><option>类型</option><option>名称</option><option>创建时间</option></select>
          </div>
          <div className="material-grid">
            {visibleAssets.length ? visibleAssets.map(material => (
              <div className={`material-card ${selectedMaterialIds.includes(material.id) ? "selected" : ""}`} key={material.id} onClick={() => toggleMaterial(material.id)}>
                <div className="material-preview">
                  {material.kind === "image" && material.previewUrl ? <img src={material.previewUrl} alt={material.name} /> : material.kind === "video" && material.previewUrl ? <video src={material.previewUrl} controls /> : <span>{material.kind === "sd2" ? "Prompt" : material.kind}</span>}
                </div>
                <strong>{material.name}</strong>
                <p className="muted">{material.kind} / {material.role}</p>
                <p className="muted">{material.reviewedAssetUrl || material.seedanceAssetUrl || material.url || "仅本地预览，真实生成不会使用"}</p>
                {material.seedanceAssetUrl && <span className="reviewed-badge">已登记外接素材</span>}
                {material.reviewedAssetUrl && <span className="reviewed-badge">已绑定外接素材</span>}
                {!material.reviewedAssetUrl && !material.seedanceAssetUrl && !material.url && <span className="local-only-badge">仅本地预览</span>}
                <div className="actions"><button className="btn-ghost btn-small" onClick={event => { event.stopPropagation(); toggleMaterial(material.id); }}>{selectedMaterialIds.includes(material.id) ? "取消@" : "用于@"}</button>{!material.seedanceAssetUrl && !material.reviewedAssetUrl && material.url && <button className="btn-ghost btn-small" onClick={event => { event.stopPropagation(); registerMaterialToSeedance(material.id); }}>重新登记外接资产</button>}<button className="btn-danger btn-small" onClick={event => { event.stopPropagation(); deleteMaterial(material.id); }}>删除</button></div>
              </div>
            )) : <div className="empty">当前 {activeAssetTab === "image" ? "图片" : activeAssetTab === "video" ? "视频" : activeAssetTab === "audio" ? "音频" : "SD2素材"} 分类暂无素材，请点击“生成 Prompt”“生成图片”或在右侧添加公网素材。</div>}
          </div>
          {hiddenAssetCount > 0 && <button className="collapse-toggle" onClick={() => setShowAllAssets(prev => !prev)}>{showAllAssets ? "收起" : `展开全部 ${hiddenAssetCount}`}</button>}
        </section>

        <section className="card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>添加素材</h2>
          <div className="form">
            <div><label>素材名称</label><input value={materialName} onChange={event => setMaterialName(event.target.value)} /></div>
            <div><label>公网素材 URL</label><input value={materialUrl} onChange={event => setMaterialUrl(event.target.value)} placeholder="https://example.com/reference.png，添加后可登记到外接素材库" /></div>
            <div><label>已有外接 asset ID（可选）</label><input value={reviewedAssetInput} onChange={event => setReviewedAssetInput(event.target.value)} placeholder="已有资产时填 1818... 或 asset://1818...；一般不用填" /></div>
            <div><label>素材类型</label><select value={materialKind} onChange={event => { const next = event.target.value as MaterialKind; setMaterialKind(next); setActiveAssetTab(next); setMaterialRole(next === "image" || next === "sd2" ? "reference_image" : next === "video" ? "reference_video" : "reference_audio"); }}><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option><option value="sd2">SD2素材</option></select></div>
            <div><label>素材角色</label><select value={materialRole} onChange={event => setMaterialRole(event.target.value as MaterialRole)}><option value="reference_image">参考图</option><option value="first_frame">首帧图</option><option value="last_frame">尾帧图</option><option value="reference_video">参考视频</option><option value="reference_audio">参考音频</option></select></div>
            <button className="btn-primary" onClick={addMaterialFromUrl}>添加并登记外接资产</button>
            <div><label>本地上传预览（不会传给真实视频 API）</label><input type="file" accept="image/*,video/*,audio/*" onChange={addLocalPreview} /></div>
            <p className="muted">{materialMessage || "提示：真实视频生成只能使用公网 URL 或已登记 asset:// 素材；本地上传文件仅用于页面预览，不能作为 Seedance 参考图。"}</p>
          </div>
        </section>
        </div>

        <div style={sectionStyle("tasks")}>
          <h2 id="tasks">生成任务</h2><section className="card"><div className="task-head"><p className="muted">默认展示最近 5 个任务，完成后可在这里预览/下载，也可到资产库查看视频播放器。</p></div><div className="table-wrap"><table className="table"><thead><tr><th>任务 ID</th><th>关联分镜</th><th>服务商</th><th>进度</th><th>结果</th><th>操作</th></tr></thead><tbody>{visibleTasks.length ? visibleTasks.map(task => { const taskAsset = state.assets.find(asset => asset.shotId === task.shotId && asset.videoUrl); const taskVideoId = taskAsset?.providerTaskId || task.providerTaskId; return <tr key={task.id}><td>{task.id}</td><td>#{String(task.shotId).padStart(2, "0")} {task.shotTitle}</td><td>{task.provider}</td><td>{taskStatusTag(task.status)}</td><td>{task.result}{taskAsset?.videoUrl && <div className="task-video-actions"><a href={proxiedVideoUrl(taskAsset.videoUrl, false, taskVideoId, activeApiProfile)} target="_blank" rel="noreferrer">预览视频</a><a href={proxiedVideoUrl(taskAsset.videoUrl, true, taskVideoId, activeApiProfile)}>下载</a></div>}</td><td><button className="btn-danger btn-small" onClick={() => deleteTask(task.id)}>删除</button></td></tr>; }) : <tr><td colSpan={6}><div className="empty">暂无生成任务。</div></td></tr>}</tbody></table></div>{hiddenTaskCount > 0 && <button className="collapse-toggle" onClick={() => setShowAllTasks(prev => !prev)}>{showAllTasks ? "收起" : `展开全部 ${hiddenTaskCount}`}</button>}</section>
        </div>

        <div style={sectionStyle("generated-videos")}>
          <section className="card generated-video-library">
            <div className="card-title-row"><div><h2 style={{ marginTop: 0 }}>已生成视频</h2><p className="muted">同步本页任务状态后，成功视频会出现在这里，可直接播放、打开或下载。</p></div><button className="btn-primary btn-small" onClick={refreshAllTaskStatuses}>同步本页任务状态</button></div>
            {visibleVideoAssets.length ? <div className="video-preview-grid">{visibleVideoAssets.map(asset => <div className="video-preview-card" key={asset.id}>{asset.videoUrl && <video src={proxiedVideoUrl(asset.videoUrl, false, asset.providerTaskId, activeApiProfile)} controls preload="metadata" />}<strong>{asset.title}</strong><p className="muted">{asset.meta}</p><div className="task-video-actions">{asset.videoUrl && <a href={proxiedVideoUrl(asset.videoUrl, false, asset.providerTaskId, activeApiProfile)} target="_blank" rel="noreferrer">新窗口打开</a>}{asset.videoUrl && <a href={proxiedVideoUrl(asset.videoUrl, true, asset.providerTaskId, activeApiProfile)}>下载视频</a>}</div></div>)}</div> : <div className="empty">暂无可预览视频。请先点击“同步本页任务状态”，或等待生成任务完成。</div>}
            {hiddenVideoAssetCount > 0 && <button className="collapse-toggle" onClick={() => setShowAllVideoAssets(prev => !prev)}>{showAllVideoAssets ? "收起" : `展开全部 ${hiddenVideoAssetCount}`}</button>}
          </section>
        </div>

        <div style={sectionStyle("assets")}>
          <section id="assets" className="library-section lizhen-section">
            <div className="external-library-title"><div><h1>外接资产库</h1><p>统一管理来自第三方平台的真实 asset:// 资产。默认展示最近 5 个，展开后查看全部；勾选后会提交给真实视频 API。</p></div><span className="source-pill external">第三方资产</span></div>
            <div className="library-search">
              <span>⌕</span>
              <input value={librarySearch} onChange={event => setLibrarySearch(event.target.value)} placeholder="搜索资产名称、类型或 asset://id" />
              <button onClick={loadLizhenAssets}>{isLoadingLizhenAssets ? "同步中" : "刷新"}</button>
            </div>
            <div className="library-toolbar">
            <div className="library-filter"><span>类型</span>{([["all", "全部"], ["image", "图片"], ["video", "视频"], ["text", "音频"]] as [LibraryFilter, string][]).map(([key, label]) => <button key={key} className={libraryFilter === key ? "active" : ""} onClick={() => setLibraryFilter(key)}>{label}</button>)}</div>
            <div className="library-actions"><button className="btn-ghost" onClick={loadLizhenAssets}>刷新外接资产</button><button className="btn-primary" onClick={() => document.getElementById("material-assets")?.scrollIntoView({ behavior: "smooth" })}>上传新资产</button></div>
          </div>
          <p className="muted">{lizhenAssetMessage || "外接资产数据来自 /api/assets。"} 已选择 {selectedLizhenAssetIds.length} 个外接资产用于生成视频。</p>
          <div className="table-wrap lizhen-table-wrap">
            <table className="table lizhen-table">
              <thead><tr><th>选择</th><th>资产名称</th><th>asset://</th><th>类型</th><th>同步状态</th><th>失败原因</th><th>资产状态</th><th>所属组</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>{visibleLizhenAssets.map(asset => <tr key={asset.id} className={selectedLizhenAssetIds.includes(asset.id) ? "selected-row" : ""}><td><input type="checkbox" checked={selectedLizhenAssetIds.includes(asset.id)} onChange={() => toggleLizhenAsset(asset.id)} /></td><td><strong>{asset.asset_name}</strong><br /><span className="muted">ID: {asset.id}</span></td><td><code>{asset.asset_url}</code></td><td>{asset.类型}</td><td><span className="sync-badge success">{asset.同步状态}</span></td><td>{asset.失败原因}</td><td><span className="sync-badge reviewed">{asset.资产状态}</span></td><td>{asset.所属组}</td><td>{asset.创建时间}</td><td><div className="table-actions"><button onClick={() => alert(JSON.stringify(asset, null, 2))}>详情</button><button onClick={() => toggleLizhenAsset(asset.id)}>{selectedLizhenAssetIds.includes(asset.id) ? "取消使用" : "用于生成"}</button><button className="danger" onClick={() => alert("删除功能下一步接入 /api/assets delete")}>删除</button></div></td></tr>)}</tbody>
            </table>
            {!filteredLizhenAssets.length && <div className="library-empty"><div className="empty-ico">▱</div><strong>暂无外接资产</strong><p>请先上传资产，或点击刷新同步外接资产库。</p></div>}
            {hiddenLizhenAssetCount > 0 && <button className="collapse-toggle" onClick={() => setShowAllLizhenAssets(prev => !prev)}>{showAllLizhenAssets ? "收起" : `展开全部 ${hiddenLizhenAssetCount}`}</button>}
          </div>
        </section>
        </div>
      </main>

      <div className={`modal ${passwordModalOpen ? "open" : ""}`} onClick={event => event.target === event.currentTarget && setPasswordModalOpen(false)}><div className="modal-card"><div className="modal-head"><h2>修改密码</h2><button className="btn-ghost btn-small" onClick={() => setPasswordModalOpen(false)}>关闭</button></div><div className="form"><div><label>手机号</label><input value={securityPhone} onChange={event => setSecurityPhone(event.target.value)} placeholder="请输入绑定手机号" /></div><div><label>验证码</label><div className="code-row"><input value={securityCode} onChange={event => setSecurityCode(event.target.value)} placeholder="请输入 6 位验证码" /><button className="btn-primary" onClick={() => alert(`验证码已发送至 ${securityPhone}`)}>发送验证码</button></div></div><div><label>新密码</label><input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="请输入新密码（至少 6 个字符）" /></div><div><label>确认新密码</label><input type="password" value={confirmNewPassword} onChange={event => setConfirmNewPassword(event.target.value)} placeholder="请再次输入新密码" /></div><div className="actions"><button className="btn-ghost" onClick={() => setPasswordModalOpen(false)}>取消</button><button className="btn-primary" onClick={() => { if (!securityCode || !newPassword || newPassword !== confirmNewPassword) return alert("请确认验证码和两次密码输入一致。"); setPasswordModalOpen(false); alert("演示环境已完成密码修改流程。") }}>确认修改</button></div></div></div></div>
      <div className={`modal ${projectModalOpen ? "open" : ""}`} onClick={event => event.target === event.currentTarget && setProjectModalOpen(false)}><div className="modal-card"><div className="modal-head"><h2>新建项目</h2><button className="btn-ghost btn-small" onClick={() => setProjectModalOpen(false)}>关闭</button></div><div className="form"><div><label>项目名称</label><input value={projectName} onChange={event => setProjectName(event.target.value)} /></div><div><label>项目类型</label><select value={projectType} onChange={event => setProjectType(event.target.value)}><option>都市短剧</option><option>古风短剧</option><option>悬疑短剧</option><option>漫剧</option></select></div><button className="btn-primary" onClick={saveProject}>创建项目</button></div></div></div>
      <div className={`modal ${scriptModalOpen ? "open" : ""}`} onClick={event => event.target === event.currentTarget && setScriptModalOpen(false)}><div className="modal-card"><div className="modal-head"><h2>导入剧本</h2><button className="btn-ghost btn-small" onClick={() => setScriptModalOpen(false)}>关闭</button></div><div className="form"><div><label>剧本内容</label><textarea style={{ minHeight: 180 }} value={scriptInput} onChange={event => setScriptInput(event.target.value)} /></div><button className="btn-primary" onClick={saveScript}>保存剧本</button><div className="script-box">{scriptPreview || "暂无剧本内容"}</div>{scriptTooLong && <button className="collapse-toggle" onClick={() => setShowFullScript(prev => !prev)}>{showFullScript ? "收起" : "展开全部剧本"}</button>}</div></div></div>
      <div className={`modal ${batchModalOpen ? "open" : ""}`} onClick={event => event.target === event.currentTarget && setBatchModalOpen(false)}><div className="modal-card modal-card-wide"><div className="modal-head"><h2>批量导入提示词</h2><button className="btn-ghost btn-small" onClick={() => setBatchModalOpen(false)}>关闭</button></div><div className="form"><div><label>目标总时长</label><select value={batchTargetDuration} onChange={event => setBatchTargetDuration(Number(event.target.value))}><option value="6">6s</option><option value="9">9s</option><option value="12">12s</option></select></div><div><label>粘贴完整提示词</label><textarea className="batch-prompt" value={batchPromptInput} onChange={event => setBatchPromptInput(event.target.value)} placeholder="粘贴一整段短剧视频提示词。系统会像剪辑师一样自动拆成 2-7 个镜头；不可拆分时会按上方目标总时长生成一条完整分镜。" /></div><div className="batch-preview"><strong>专业剪辑拆分规则</strong><p>不会把整段提示词保留为镜头01；镜头01就是拆分后的第一段。支持 0-3秒 时间轴，也支持无时间轴长文本自动拆分。不可拆分时按 6s/9s/12s 完整生成，避免压缩到 3s。</p></div><button className="btn-primary" onClick={importBatchShots}>生成分镜</button></div></div></div>
      <div className={`modal ${promptModalOpen ? "open" : ""}`} onClick={event => event.target === event.currentTarget && setPromptModalOpen(false)}><div className="modal-card"><div className="modal-head"><h2>生成 Prompt</h2><button className="btn-ghost btn-small" onClick={() => setPromptModalOpen(false)}>关闭</button></div><div className="form"><div><label>Prompt 内容</label><textarea style={{ minHeight: 180 }} value={promptDraft} onChange={event => setPromptDraft(event.target.value)} /></div><button className="btn-primary" onClick={saveGeneratedPrompt}>保存到分镜与 SD2素材</button><p className="muted">这里先提供可编辑 Prompt 生成对话框，保存后会写入当前分镜提示词，并出现在 SD2素材分类。</p></div></div></div>
      <div className={`modal ${imageModalOpen ? "open" : ""}`} onClick={event => event.target === event.currentTarget && setImageModalOpen(false)}><div className="modal-card"><div className="modal-head"><h2>生成图片</h2><button className="btn-ghost btn-small" onClick={() => setImageModalOpen(false)}>关闭</button></div><div className="form"><div><label>图片生成描述</label><textarea style={{ minHeight: 160 }} value={imagePromptDraft} onChange={event => setImagePromptDraft(event.target.value)} /></div><button className="btn-primary" onClick={saveImagePlaceholder}>创建图片素材占位</button><p className="muted">当前视频 API 已接入；图片生成按钮先创建可管理的图片素材占位。拿到公网图片 URL 后，可在“添加素材”中用于真实视频生成。</p></div></div></div>
    </div>
  );
}
