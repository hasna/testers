import { createProject as createTesterProject, getProjectByPath, listProjects } from "../db/projects.js";
import type { Project } from "../types/index.js";

interface OpenProjectRecord {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  path?: string | null;
  primary_path?: string | null;
}

interface OpenProjectsSdk {
  getProject?: (ref: string) => OpenProjectRecord | null;
  getProjectBySlug?: (ref: string) => OpenProjectRecord | null;
  getProjectByPath?: (path: string) => OpenProjectRecord | null;
  listProjects?: (filter?: { status?: "active"; limit?: number }) => OpenProjectRecord[];
  createProject?: (input: {
    name: string;
    path: string;
    description?: string;
    git_init?: boolean;
    tags?: string[];
  }) => OpenProjectRecord;
  getWorkspace?: (ref: string) => OpenProjectRecord | null;
  getWorkspaceBySlug?: (ref: string) => OpenProjectRecord | null;
  getWorkspaceByPath?: (path: string) => OpenProjectRecord | null;
  listWorkspaces?: (filter?: { status?: "active"; limit?: number }) => OpenProjectRecord[];
  createWorkspace?: (input: {
    name: string;
    primary_path: string;
    description?: string;
    kind?: "open-source" | "internal-app" | "platform" | "company-website" | "scaffold" | "community" | "project" | "experiment" | "docs" | "remote-only" | "generic";
    tags?: string[];
  }) => OpenProjectRecord;
}

export interface OpenProjectsMirrorResult {
  project: Project;
  openProject: {
    id: string;
    slug: string;
    name: string;
    path: string;
  };
  created: boolean;
}

export async function importFromOpenProjects(ref: string): Promise<OpenProjectsMirrorResult> {
  const sdk = await import("@hasna/projects") as OpenProjectsSdk;
  const openProject = resolveOpenProject(sdk, ref);
  if (!openProject) throw new Error(`open-projects project not found: ${ref}`);
  const openProjectRef = toOpenProjectRef(openProject);

  const existing = getProjectByPath(openProjectRef.path)
    ?? listProjects().find((project) => project.settings.openProjectsProjectId === openProjectRef.id);
  if (existing) {
    return {
      project: existing,
      openProject: openProjectRef,
      created: false,
    };
  }

  const project = createTesterProject({
    name: openProject.name,
    path: openProjectRef.path,
    description: openProject.description ?? undefined,
    settings: {
      openProjectsProjectId: openProject.id,
      openProjectsSlug: openProject.slug,
      source: "open-projects",
    },
  });

  return {
    project,
    openProject: openProjectRef,
    created: true,
  };
}

export async function exportToOpenProjects(projectIdOrName: string): Promise<OpenProjectsMirrorResult> {
  const project = listProjects().find((item) => (
    item.id === projectIdOrName
    || item.id.startsWith(projectIdOrName)
    || item.name === projectIdOrName
  ));
  if (!project) throw new Error(`Project not found: ${projectIdOrName}`);
  if (!project.path) throw new Error(`Project has no path to export to open-projects: ${project.name}`);

  const sdk = await import("@hasna/projects") as OpenProjectsSdk;
  const existing = resolveOpenProjectByPath(sdk, project.path);
  const openProject = existing ?? createOpenProject(sdk, project);

  return {
    project,
    openProject: toOpenProjectRef(openProject),
    created: !existing,
  };
}

function resolveOpenProject(sdk: OpenProjectsSdk, ref: string): OpenProjectRecord | null {
  return sdk.getProject?.(ref)
    ?? sdk.getProjectBySlug?.(ref)
    ?? sdk.getProjectByPath?.(ref)
    ?? sdk.getWorkspace?.(ref)
    ?? sdk.getWorkspaceBySlug?.(ref)
    ?? sdk.getWorkspaceByPath?.(ref)
    ?? listOpenProjects(sdk).find((project) => project.name === ref || project.slug === ref)
    ?? null;
}

function resolveOpenProjectByPath(sdk: OpenProjectsSdk, path: string): OpenProjectRecord | null {
  return sdk.getProjectByPath?.(path) ?? sdk.getWorkspaceByPath?.(path) ?? null;
}

function listOpenProjects(sdk: OpenProjectsSdk): OpenProjectRecord[] {
  if (sdk.listProjects) return sdk.listProjects({ status: "active", limit: 1000 });
  if (sdk.listWorkspaces) return sdk.listWorkspaces({ status: "active", limit: 1000 });
  return [];
}

function createOpenProject(sdk: OpenProjectsSdk, project: Project): OpenProjectRecord {
  if (!project.path) throw new Error(`Project has no path to export to open-projects: ${project.name}`);
  if (sdk.createProject) {
    return sdk.createProject({
      name: project.name,
      path: project.path,
      description: project.description ?? undefined,
      git_init: false,
      tags: ["testers"],
    });
  }
  if (sdk.createWorkspace) {
    return sdk.createWorkspace({
      name: project.name,
      primary_path: project.path,
      description: project.description ?? undefined,
      kind: "project",
      tags: ["testers"],
    });
  }
  throw new Error("@hasna/projects does not expose createWorkspace or createProject");
}

function toOpenProjectRef(openProject: OpenProjectRecord) {
  const path = openProject.path ?? openProject.primary_path ?? "";
  if (!path) throw new Error(`open-projects project has no path: ${openProject.name}`);
  return {
    id: openProject.id,
    slug: openProject.slug,
    name: openProject.name,
    path,
  };
}
