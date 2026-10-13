"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type UserRole = "RESIDENT" | "STAFF" | "ADMIN"

interface UserData {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  phone: string
  address?: string | null
  city?: string | null
  zip?: string | null
  role: UserRole
  createdAt: string
}

interface UserFormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  zip: string
  role: UserRole
  password: string
}

const defaultFormData: UserFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  zip: "",
  role: "RESIDENT",
  password: "",
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n")

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()

  const [users, setUsers] = useState<UserData[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false)

  const [selectedUser, setSelectedUser] = useState<UserData | null>(null)
  const [formData, setFormData] = useState<UserFormData>(defaultFormData)
  const [formError, setFormError] = useState("")
  const [pageError, setPageError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [resetPasswordResult, setResetPasswordResult] = useState("")

  const loadUsers = async () => {
    try {
      setIsLoading(true)
      setPageError("")

      const res = await fetch("/api/admin/users", {
        credentials: "include",
        cache: "no-store",
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load users")
      }

      setUsers(Array.isArray(data?.users) ? data.users : [])
    } catch (error) {
      setUsers([])
      setPageError(error instanceof Error ? error.message : "Failed to load users")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.phone.toLowerCase().includes(q)

      const matchesRole = roleFilter === "all" || user.role === roleFilter
      return matchesSearch && matchesRole
    })
  }, [users, searchQuery, roleFilter])

  const residentCount = users.filter((u) => u.role === "RESIDENT").length
  const staffCount = users.filter((u) => u.role === "STAFF").length
  const adminCount = users.filter((u) => u.role === "ADMIN").length

  const resetForm = () => {
    setFormData(defaultFormData)
    setFormError("")
  }

  const openEditModal = (user: UserData) => {
    setSelectedUser(user)
    setFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || "",
      address: user.address || "",
      city: user.city || "",
      zip: user.zip || "",
      role: user.role,
      password: "",
    })
    setFormError("")
    setIsEditModalOpen(true)
  }

  const openDeleteModal = (user: UserData) => {
    setSelectedUser(user)
    setFormError("")
    setIsDeleteModalOpen(true)
  }

  const openResetPasswordModal = (user: UserData) => {
    setSelectedUser(user)
    setNewPassword("")
    setResetPasswordResult("")
    setFormError("")
    setIsResetPasswordModalOpen(true)
  }

  const handleExportReport = () => {
    const headers = [
      "Full Name",
      "Email",
      "Phone",
      "Role",
      "Address",
      "City",
      "ZIP",
      "Created At",
    ]

    const rows = filteredUsers.map((user) => [
      user.name,
      user.email,
      user.phone || "",
      user.role,
      user.address || "",
      user.city || "",
      user.zip || "",
      new Date(user.createdAt).toLocaleString(),
    ])

    downloadCsv("user-management-report.csv", [headers, ...rows])
  }

  const handleAddUser = async () => {
    try {
      setFormError("")
      setSuccessMessage("")

      if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
        setFormError("Please fill in all required fields")
        return
      }

      setIsSubmitting(true)

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(formData),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || "Failed to create user")
      }

      setIsAddModalOpen(false)
      resetForm()
      setSuccessMessage("User created successfully")
      await loadUsers()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create user")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditUser = async () => {
    if (!selectedUser) return

    try {
      setFormError("")
      setSuccessMessage("")

      if (!formData.firstName || !formData.lastName || !formData.email) {
        setFormError("Please fill in all required fields")
        return
      }

      if (currentUser?.id === selectedUser.id && formData.role !== "ADMIN") {
        setFormError("You cannot change your own admin role")
        return
      }

      setIsSubmitting(true)

      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        zip: formData.zip,
        role: formData.role,
      }

      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || "Failed to update user")
      }

      setIsEditModalOpen(false)
      setSelectedUser(null)
      resetForm()
      setSuccessMessage("User updated successfully")
      await loadUsers()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to update user")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return

    try {
      setFormError("")
      setSuccessMessage("")

      if (currentUser?.id === selectedUser.id) {
        setFormError("You cannot delete your own account")
        return
      }

      setIsSubmitting(true)

      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "DELETE",
        credentials: "include",
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete user")
      }

      setIsDeleteModalOpen(false)
      setSelectedUser(null)
      setSuccessMessage("User deleted successfully")
      await loadUsers()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to delete user")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetPassword = async () => {
    if (!selectedUser) return

    try {
      setFormError("")
      setResetPasswordResult("")
      setSuccessMessage("")

      if (!newPassword.trim()) {
        setFormError("Please enter a new password")
        return
      }

      setIsSubmitting(true)

      const res = await fetch(`/api/admin/users/${selectedUser.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ password: newPassword }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || "Failed to reset password")
      }

      setResetPasswordResult(data?.temporaryPassword || newPassword)
      setSuccessMessage("Password reset successfully")
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to reset password")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isEditingSelf = !!selectedUser && currentUser?.id === selectedUser.id

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">User Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage system users, roles, and permissions
        </p>
      </div>

      {pageError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {pageError}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
            </div>
            <div>
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-sm text-muted-foreground">Total Users</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            </div>
            <div>
              <p className="text-2xl font-bold">{residentCount}</p>
              <p className="text-sm text-muted-foreground">Residents</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
            </div>
            <div>
              <p className="text-2xl font-bold">{staffCount}</p>
              <p className="text-sm text-muted-foreground">Staff</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/></svg>
            </div>
            <div>
              <p className="text-2xl font-bold">{adminCount}</p>
              <p className="text-sm text-muted-foreground">Admins</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {(["all", "RESIDENT", "STAFF", "ADMIN"] as const).map((role) => (
                <Badge
                  key={role}
                  variant={roleFilter === role ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setRoleFilter(role)}
                >
                  {role === "all" ? "All" : role}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-9"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportReport}
                disabled={filteredUsers.length === 0}
              >
                Generate Report
              </Button>

              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  resetForm()
                  setIsAddModalOpen(true)
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Add User
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System Users</CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading users..."
              : `${filteredUsers.length} user${filteredUsers.length !== 1 ? "s" : ""} found`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
              <p className="mt-4 text-sm text-muted-foreground">No users found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredUsers.map((user) => {
                const isSelf = currentUser?.id === user.id

                return (
                  <div
                    key={user.id}
                    className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                        {user.firstName?.[0]}{user.lastName?.[0]}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{user.name}</span>
                          <Badge
                            variant="secondary"
                            className={
                              user.role === "ADMIN"
                                ? "bg-amber-100 text-amber-700"
                                : user.role === "STAFF"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-blue-100 text-blue-700"
                            }
                          >
                            {user.role}
                          </Badge>
                          {isSelf && <Badge variant="outline">You</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.phone || "No phone"} • Joined {new Date(user.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditModal(user)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openResetPasswordModal(user)}>
                        Reset Password
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive disabled:text-muted-foreground"
                        onClick={() => openDeleteModal(user)}
                        disabled={isSelf}
                        title={isSelf ? "You cannot delete your own account" : "Delete user"}
                      >
                        {isSelf ? "Protected" : "Delete"}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account for residents, staff, or admins.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>First Name *</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Last Name *</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>ZIP</Label>
                <Input
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(value: UserRole) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RESIDENT">Resident</SelectItem>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Password *</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddUser} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user account information and role.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            {isEditingSelf && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Your own admin role is protected and cannot be changed.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>First Name *</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Last Name *</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>ZIP</Label>
                <Input
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(value: UserRole) => setFormData({ ...formData, role: value })}
                disabled={isEditingSelf}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RESIDENT">Resident</SelectItem>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditUser} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {selectedUser.firstName?.[0]}{selectedUser.lastName?.[0]}
              </div>
              <div>
                <p className="text-sm font-medium">{selectedUser.name}</p>
                <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
              </div>
            </div>
          )}

          {selectedUser && currentUser?.id === selectedUser.id && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Your own account cannot be deleted.
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={isSubmitting || currentUser?.id === selectedUser?.id}
            >
              {isSubmitting ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isResetPasswordModalOpen} onOpenChange={setIsResetPasswordModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for this user.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {selectedUser && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{selectedUser.name}</p>
                <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
              </div>
            )}

            {formError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            {resetPasswordResult && (
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                Password reset successful. New password: <strong>{resetPasswordResult}</strong>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetPasswordModalOpen(false)}>
              Close
            </Button>
            <Button onClick={handleResetPassword} disabled={isSubmitting}>
              {isSubmitting ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}