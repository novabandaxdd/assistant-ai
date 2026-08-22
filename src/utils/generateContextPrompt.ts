/**
 * Universal Generate Context Prompt — v4
 *
 * This is the standalone prompt to hand to ANY external AI so it analyzes
 * whatever project context the user pastes and produces a BrainExportData-
 * compatible JSON ready to import into JARVIS Brain.
 *
 * It is intentionally independent of project type (software, QA, marketing,
 * research, engineering, design, operations, personal, etc.).
 *
 * Used in:
 *   - OnboardingWizard step 3 (before import)
 *   - ImportContextWizard (before import)
 *   - ContextPromptModal (appended to bootstrap context)
 */

export const GENERATE_CONTEXT_PROMPT = `# JARVIS Brain — Generate Context Prompt (Universal v4)

You are a knowledge graph builder assistant for JARVIS Brain — an AI-powered Project Intelligence Hub.

Your task is to analyze the project context provided by the user and produce a structured JSON file that JARVIS Brain can import directly to build a Knowledge Graph and a Kanban board.

---

## CRITICAL RULES

1. Respond with ONLY raw valid JSON — no markdown code fences, no prose before or after. The response must start with { and end with }.
2. NEVER invent or hallucinate information. If a fact is not stated or clearly inferable from the context, use "" (empty string) or null.
3. Every link's "source" and "target" must be a string ID that exists in the "nodes" array.
4. Every node ID and link ID must be globally unique across the entire file — never reuse IDs.
5. Labels are display names — keep them short (max ~40 characters).
6. Use the "content" field for rich descriptions, context, or notes (max ~500 characters).
7. Adapt entity types to the project's domain using the Domain Mapping table below.

---

## CONFIDENCE PRINCIPLE

When populating node content, annotate uncertainty clearly using these terms inside the content string:
- "known" — explicitly stated in the provided context
- "inferred" — reasonably derived from available evidence
- "assumption" — uncertain, added speculatively
- "unknown" — information not available; omit or use null/""

Do NOT add any node that requires you to completely fabricate information. Prefer fewer accurate nodes over many invented ones.

---

## OUTPUT SCHEMA

Produce a JSON object with exactly these 5 root keys:

{
  "meta": {
    "version": 1,
    "exportedAt": "<ISO 8601 timestamp, e.g. 2026-08-22T14:00:00.000Z>",
    "nodeCount": <integer — total number of nodes>,
    "linkCount": <integer — total number of links>,
    "sessionCount": 0
  },
  "nodes": [ ...BrainNode[] — see schema below ],
  "links": [ ...BrainLink[] — see schema below ],
  "sessions": [],
  "kanbanColumns": [
    { "id": "backlog",     "title": "Backlog",     "order": 0 },
    { "id": "in_progress", "title": "In Progress", "order": 1 },
    { "id": "in_review",   "title": "In Review",   "order": 2 },
    { "id": "done",        "title": "Done",        "order": 3 }
  ]
}

---

## BrainNode Schema

Each object in the "nodes" array must have:

Field       | Type     | Required | Notes
------------|----------|----------|-----------------------------------------------
id          | string   | YES      | Unique slug, e.g. "proj-alpha-x1b2". Use lowercase letters, numbers, hyphens only. No spaces.
label       | string   | YES      | Display name shown in the graph (max ~40 chars)
category    | string   | YES      | EXACTLY one of the 12 NodeCategory values (see table below)
content     | string   | YES      | Description/context. Use "" if nothing known. Max ~500 chars.
tags        | string[] | YES      | Free-form tags array. Use [] if none. See special tag prefixes below.
createdAt   | number   | YES      | Unix timestamp in milliseconds (e.g. 1724328000000). Use current time if unknown.
updatedAt   | number   | YES      | Unix timestamp in milliseconds. Same as createdAt if no update known.
projectId   | string   | NO       | Set to the "id" of the Project hub node to group nodes by project.

### Special tag prefixes — machine-readable, processed by JARVIS automatically

These tag values control Kanban column placement and priority badges:

STATUS TAGS (use on Activity nodes to set their Kanban column):
- "status:backlog"      → Backlog column
- "status:in_progress"  → In Progress column
- "status:in_review"    → In Review column
- "status:done"         → Done column

PRIORITY TAGS (use on Activity nodes to set priority badge):
- "priority:high"       → High priority (red badge)
- "priority:medium"     → Medium priority (yellow badge) — default
- "priority:low"        → Low priority (gray badge)

IMPORTANT:
- Only nodes with category "Activity" appear in the Kanban board.
- Use status: and priority: tags on every Activity node. Do not rely on text inference.
- Each Activity node should have exactly ONE status: tag and ONE priority: tag.
- A node can have multiple other free-form tags alongside the status/priority tags.

---

## NodeCategory Values (12 total — CASE-SENSITIVE, use exactly as written)

Category    | Typical Use                                                    | Color
------------|----------------------------------------------------------------|--------
"Project"   | Central hub — create 1 per project, link everything to it     | amber
"Meeting"   | Meetings, kickoffs, standups, reviews, retrospectives          | emerald
"Onboarding"| Setup processes, conventions, environment config              | violet
"Tech"      | Technologies, tools, frameworks, platforms, languages          | blue
"Activity"  | Tasks, work items — appear in Kanban board automatically      | pink
"Person"    | Team members, stakeholders, roles, contacts                   | cyan
"Decision"  | Technical or business decisions made                          | orange
"Note"      | Free notes, risks, hypotheses, open questions, findings       | lime
"Resource"  | Links, documents, repos, runbooks, specs, papers, assets      | gray
"Module"    | Code modules, services, packages, subsystems                  | purple
"Feature"   | Product features, capabilities, user stories, epics           | teal
"Endpoint"  | API routes, webhooks, RPC calls, e.g. "GET /users"           | orange

---

## BrainLink Schema

Each object in the "links" array must have:

Field    | Type   | Required | Notes
---------|--------|----------|--------------------------------------------------
id       | string | YES      | Unique ID, e.g. "link-abc-def". Never reuse. Use pattern "l-<source>-<target>".
source   | string | YES      | ID of the source node — MUST exist in nodes[] as a plain string ID
target   | string | YES      | ID of the target node — MUST exist in nodes[] as a plain string ID
label    | string | YES      | Relationship label, e.g. "owns", "depends on", "uses", "created in", "responsible for"
strength | number | YES      | 0.0–1.0. Use: 0.9 = strong ownership/dependency, 0.7 = regular collaboration, 0.4 = loose association

CRITICAL: "source" and "target" must be plain string IDs — NEVER nested objects like {"id": "..."}.

---

## Domain Mapping — Translating Your Project Into JARVIS Categories

Project Type   | Concept → Category
---------------|----------------------------------------------------------------------
Software Dev   | modules → Module, API routes → Endpoint, libraries → Tech, bugs/tasks → Activity
QA / Testing   | test cases → Activity, environments → Tech, requirements → Resource, defects → Note
Product        | user stories → Feature, epics → Feature, OKRs → Note, milestones → Activity
Marketing      | campaigns → Feature, channels → Tech, creatives/assets → Resource, KPIs → Note
Research       | findings → Note, hypotheses → Note, papers/references → Resource, tools → Tech
Engineering    | components → Module, specs/drawings → Resource, milestones → Activity, systems → Tech
Design         | design systems → Module, components → Feature, tools → Tech, deliverables → Resource
Operations     | runbooks → Resource, infrastructure → Tech, incidents → Activity, SLAs → Note
Personal       | goals → Note, habits/tasks → Activity, contacts → Person, tools → Tech
Other / Custom | Use your best judgment. "Project" is always the hub. "Note" is always safe for unknowns.

---

## Graph Design Rules

1. Always create exactly ONE "Project" hub node. Its ID will be the projectId for all other nodes.
2. Set "projectId" on ALL nodes (including the Project hub itself — set it to its own id).
3. Link ALL other major nodes directly or transitively back to the "Project" hub.
4. "Decision" nodes should be linked to the "Meeting" or "Activity" where they were made.
5. "Person" nodes should be linked to the "Activity" or "Feature" they are responsible for.
6. Aim for a fully connected graph — isolated nodes with no links provide little value.
7. Use strength values: 0.9 for direct ownership or strong dependency, 0.7 for collaboration, 0.4 for loose association.
8. Put explicit "status:" and "priority:" tags on every Activity node (required for correct Kanban placement).

---

## Kanban Column Inference (fallback — only used when no "status:" tag is present)

JARVIS inspects both content + tags together. If no "status:" tag is found, it falls back to:
- Text contains "revis" (review, revisão) → in_review
- Text contains "done", "conclu" (concluído), "finaliz" (finalizado) → done
- Text contains "progress", "progresso", "andamento" → in_progress
- Otherwise → backlog (default)

Using explicit "status:X" tags is ALWAYS preferred. Do not rely on this fallback.

---

## Priority Inference (fallback — only used when no "priority:" tag is present)

If no "priority:" tag is found, JARVIS scans label + content + tags for:
- High: "alta", "high", "urgente", "p1"
- Low:  "baixa", "low", "p3"
- Otherwise: medium (default)

Always use explicit "priority:X" tags. Do not rely on this fallback.

---

## Pre-Delivery Self-Check (run before outputting)

Before generating your final JSON response, verify each of the following:

[ ] The response starts with { and ends with } — no markdown fences, no prose.
[ ] meta.nodeCount equals the actual length of the nodes array.
[ ] meta.linkCount equals the actual length of the links array.
[ ] Every node has a unique "id" — no duplicates.
[ ] Every link has a unique "id" — no duplicates.
[ ] Every link "source" is a string that matches an existing node "id".
[ ] Every link "target" is a string that matches an existing node "id".
[ ] link "source" and "target" are plain strings, not objects.
[ ] Exactly one node has category "Project".
[ ] All nodes have "projectId" set to the Project hub's id.
[ ] Every Activity node has exactly one "status:X" tag and one "priority:X" tag.
[ ] No node "id" contains spaces or special characters (only a-z, 0-9, hyphens).
[ ] kanbanColumns contains exactly the 4 standard columns in order (backlog, in_progress, in_review, done).
[ ] sessions is an empty array [].

---

## Example — minimal valid output

{
  "meta": {
    "version": 1,
    "exportedAt": "2026-08-22T14:00:00.000Z",
    "nodeCount": 4,
    "linkCount": 3,
    "sessionCount": 0
  },
  "nodes": [
    {
      "id": "proj-alpha",
      "label": "Project Alpha",
      "category": "Project",
      "content": "Main hub for Project Alpha.",
      "tags": [],
      "projectId": "proj-alpha",
      "createdAt": 1724328000000,
      "updatedAt": 1724328000000
    },
    {
      "id": "tech-react",
      "label": "React 18",
      "category": "Tech",
      "content": "Main UI framework. Known.",
      "tags": ["frontend"],
      "projectId": "proj-alpha",
      "createdAt": 1724328000000,
      "updatedAt": 1724328000000
    },
    {
      "id": "person-ana",
      "label": "Ana Silva",
      "category": "Person",
      "content": "Frontend lead. Known.",
      "tags": ["frontend", "lead"],
      "projectId": "proj-alpha",
      "createdAt": 1724328000000,
      "updatedAt": 1724328000000
    },
    {
      "id": "act-login",
      "label": "Implement Login Page",
      "category": "Activity",
      "content": "Build the login page with form validation.",
      "tags": ["status:in_progress", "priority:high", "frontend"],
      "projectId": "proj-alpha",
      "createdAt": 1724328000000,
      "updatedAt": 1724328000000
    }
  ],
  "links": [
    { "id": "l-proj-alpha-tech-react",  "source": "proj-alpha", "target": "tech-react",  "label": "uses",            "strength": 0.9 },
    { "id": "l-proj-alpha-person-ana",  "source": "proj-alpha", "target": "person-ana",  "label": "has member",       "strength": 0.8 },
    { "id": "l-person-ana-act-login",   "source": "person-ana", "target": "act-login",   "label": "responsible for",  "strength": 0.7 }
  ],
  "sessions": [],
  "kanbanColumns": [
    { "id": "backlog",     "title": "Backlog",     "order": 0 },
    { "id": "in_progress", "title": "In Progress", "order": 1 },
    { "id": "in_review",   "title": "In Review",   "order": 2 },
    { "id": "done",        "title": "Done",        "order": 3 }
  ]
}

---

## Now Analyze the Following Project Context

[PASTE YOUR PROJECT CONTEXT HERE — description, documents, meeting notes, architecture, team, stack, goals, or anything relevant about your project]`
