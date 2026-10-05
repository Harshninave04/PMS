"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Can } from "@/components/permissions/can";
import { Users, UserPlus, Search, Pencil, Trash2, Loader2, ToggleLeft, ToggleRight, Info, Lock } from "lucide-react";
import Link from "next/link";
import { roleDescription, roleLabel } from "@/lib/rbac/roles";

interface UserItem {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  gender: string;
  role: { _id: string; role: string } | string;
  isActive: boolean;
  createdAt?: string;
}
interface RoleOption { _id: string; role: string; label?: string; description?: string; userCount?: number; }

export default function ManageUsersPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState<RoleOption[]>([]);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", gender: "", role: "", isActive: true });
  const [editLoading, setEditLoading] = useState(false);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Your own account. You may edit your name and phone, never your own role —
  // the server refuses it too, and a control that silently fails is worse than
  // one that explains itself.
  const myUserId = session?.user?.id ?? null;
  const myRoleId = session?.user?.role ?? null;

  // Reads the list. It returns the data rather than setting state, so the mount
  // effect can set state from the response (and so can a later refresh).
  const fetchUsers = useCallback(async (): Promise<UserItem[]> => {
    const res = await fetch("/api/user");
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Failed to load users");
    return (json.data || []) as UserItem[];
  }, []);

  useEffect(() => {
    let current = true;
    fetchUsers()
      .then((data) => { if (current) { setUsers(data); setLoading(false); } })
      .catch((err: unknown) => {
        if (!current) return;
        toast(err instanceof Error ? err.message : "Failed to load users", "error");
        setLoading(false);
      });
    return () => { current = false; };
  }, [fetchUsers, toast]);

  async function reload() {
    try { setUsers(await fetchUsers()); }
    catch { toast("Failed to load users", "error"); }
  }

  useEffect(() => {
    // The real role list, straight from the roles collection — no hard-coded
    // names, so a newly created role shows up here immediately.
    let current = true;
    fetch("/api/role").then(r => r.json())
      .then((roleJson: { success?: boolean; data?: RoleOption[] }) => {
        if (current && roleJson.success) setRoles(roleJson.data || []);
      })
      .catch(() => {});
    return () => { current = false; };
  }, []);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const roleIdOf = (user: UserItem) => (typeof user.role === "object" && user.role ? user.role._id : String(user.role ?? ""));
  const isMe = (user: UserItem | null | undefined) => Boolean(user && myUserId) && user!._id === myUserId;
  const isMyRole = (user: UserItem | null | undefined) => Boolean(user && myRoleId) && roleIdOf(user!) === myRoleId;

  function openEdit(user: UserItem) {
    setEditUser(user);
    setEditForm({
      name: user.name, email: user.email, phone: user.phone || "",
      gender: user.gender, role: roleIdOf(user), isActive: user.isActive,
    });
    setEditOpen(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setEditLoading(true);
    try {
      // Send only what changed, so an untouched role can never be written back
      // and trip the own-role guard.
      const body: Record<string, unknown> = { name: editForm.name, email: editForm.email, phone: editForm.phone, gender: editForm.gender, isActive: editForm.isActive };
      if (!isMe(editUser) && editForm.role !== roleIdOf(editUser)) body.role = editForm.role;
      const res = await fetch(`/api/user/${editUser._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) {
        toast({
          title: "User updated",
          description: body.role
            ? "The new role applies to that person straight away — no need for them to sign in again."
            : undefined,
          variant: "success",
        });
        setEditOpen(false);
        void reload();
      }
      else toast(json.message || "Update failed", "error");
    } catch { toast("Error updating user", "error"); } finally { setEditLoading(false); }
  }

  async function toggleActive(user: UserItem) {
    try {
      const res = await fetch(`/api/user/${user._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !user.isActive }) });
      const json = await res.json();
      if (json.success) { toast(`User ${!user.isActive ? "activated" : "deactivated"}`, "success"); void reload(); }
      else toast({ title: "Not changed", description: json.message || "Toggle failed", variant: "destructive" });
    } catch { toast("Error toggling status", "error"); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/user/${deleteTarget._id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) { toast("User deleted", "success"); setDeleteOpen(false); void reload(); }
      else toast({ title: "Not deleted", description: json.message || "Delete failed", variant: "destructive" });
    } catch { toast("Error deleting user", "error"); } finally { setDeleteLoading(false); }
  }

  const getRoleName = (role: UserItem["role"]) => typeof role === "object" ? roleLabel(role.role) : "No role";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Manage Users</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Staff logins for this hospital</p>
        </div>
        <Can permission="admin.users:create">
          <Link href="/admin/users/create">
            <Button className="gap-2"><UserPlus className="h-4 w-4" />Add New User</Button>
          </Link>
        </Can>
      </div>

      {/* Content Card */}
      <Card className="border-slate-200/80 dark:border-slate-800 shadow-xl">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"><Users className="h-5 w-5" /></div>
              <div><CardTitle className="text-base">All Users</CardTitle><CardDescription>{filtered.length} user{filtered.length !== 1 ? "s" : ""} found</CardDescription></div>
            </div>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-xs" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800/50 animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center"><Users className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" /><p className="text-sm text-slate-500">No users found</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow key={user._id}>
                    <TableCell className="font-semibold text-slate-900 dark:text-white">{user.name}</TableCell>
                    <TableCell className="text-slate-500 text-xs">{user.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="info">{getRoleName(user.role)}</Badge>
                        {isMe(user) ? <Badge variant="outline" className="gap-1"><Info className="h-3 w-3" />You</Badge> : null}
                        {!isMe(user) && isMyRole(user) ? (
                          <Badge variant="outline" className="gap-1" title="Your own role"><Lock className="h-3 w-3" />Your role</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Can permission="admin.users:update" fallback={<Badge variant="outline" className="gap-1"><ToggleRight className="h-3 w-3" />{user.isActive ? "Active" : "Inactive"}</Badge>}>
                        <button
                          onClick={() => toggleActive(user)}
                          disabled={isMe(user)}
                          title={isMe(user) ? "You cannot switch off your own account" : "Switch this account on or off"}
                          className={isMe(user) ? "cursor-not-allowed opacity-60" : undefined}
                        >
                          {user.isActive ? <Badge variant="default" className="cursor-pointer gap-1"><ToggleRight className="h-3 w-3" />Active</Badge> : <Badge variant="destructive" className="cursor-pointer gap-1"><ToggleLeft className="h-3 w-3" />Inactive</Badge>}
                        </button>
                      </Can>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Can permission="admin.users:update">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-emerald-600" onClick={() => openEdit(user)} title={isMe(user) ? "Edit your details (not your role)" : "Edit user"}><Pencil className="h-3.5 w-3.5" /></Button>
                        </Can>
                        <Can permission="admin.users:delete">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-red-600"
                            disabled={isMe(user)}
                            title={isMe(user) ? "You cannot delete your own account" : "Delete user"}
                            onClick={() => { setDeleteTarget(user); setDeleteOpen(true); }}
                          ><Trash2 className="h-3.5 w-3.5" /></Button>
                        </Can>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle><DialogDescription>Update user information</DialogDescription></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Name</Label><Input value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Phone</Label><Input value={editForm.phone} onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <Select label="Gender" value={editForm.gender} onChange={(e) => setEditForm(p => ({ ...p, gender: e.target.value }))}>
                <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Select
                label="Role"
                value={editForm.role}
                disabled={isMe(editUser)}
                onChange={(e) => setEditForm(p => ({ ...p, role: e.target.value }))}
              >
                {roles.map(r => (
                  <option key={r._id} value={r._id}>
                    {r.label ?? roleLabel(r.role)}{typeof r.userCount === "number" ? ` — ${r.userCount} user${r.userCount === 1 ? "" : "s"}` : ""}
                  </option>
                ))}
              </Select>
              {isMe(editUser) ? (
                <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                  This is your own account, so your role is locked. Ask another administrator if it needs to change.
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  {(() => {
                    const chosen = roles.find(r => r._id === editForm.role);
                    return chosen ? roleDescription(chosen.role, chosen.description) : "The new role applies immediately.";
                  })()}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={editLoading} className="gap-2">{editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
<DialogHeader><DialogTitle>Delete User</DialogTitle><DialogDescription>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</DialogDescription></DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading || isMe(deleteTarget)} className="gap-2">{deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
