import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MoreHorizontal, UserPlus, Pencil, KeyRound } from 'lucide-react';

type User = {
  id: number;
  username: string;
  fullName: string;
  role: 'admin' | 'user';
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

type CreateUserForm = {
  username: string;
  password: string;
  fullName: string;
  role: 'admin' | 'user';
};

const PASSWORD_HINT = 'Min 8 characters, 1 uppercase, 1 lowercase, 1 number';

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    username: '',
    password: '',
    fullName: '',
    role: 'user',
  });
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', role: 'user' as 'admin' | 'user' });
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Reset password dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [toggleError, setToggleError] = useState('');
  const [confirmToggle, setConfirmToggle] = useState<User | null>(null);

  async function fetchUsers() {
    setIsLoadingUsers(true);
    try {
      const { users: u } = await api.get<{ users: User[] }>('/api/users');
      setUsers(u);
    } finally {
      setIsLoadingUsers(false);
    }
  }

  useEffect(() => {
    void fetchUsers();
  }, []);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);
    try {
      await api.post('/api/users', createForm);
      setCreateDialogOpen(false);
      setCreateForm({ username: '', password: '', fullName: '', role: 'user' });
      void fetchUsers();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create user');
    } finally {
      setIsCreating(false);
    }
  }

  function openEditDialog(u: User) {
    setEditingUser(u);
    setEditForm({ fullName: u.fullName, role: u.role });
    setEditError('');
    setEditDialogOpen(true);
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setEditError('');
    setIsSavingEdit(true);
    try {
      await api.put(`/api/users/${editingUser.id}`, editForm);
      setEditDialogOpen(false);
      setEditingUser(null);
      void fetchUsers();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Failed to update user');
    } finally {
      setIsSavingEdit(false);
    }
  }

  function openResetDialog(u: User) {
    setResetUser(u);
    setNewPassword('');
    setResetError('');
    setResetSuccess('');
    setResetDialogOpen(true);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    setResetError('');
    setResetSuccess('');
    setIsResetting(true);
    try {
      await api.put(`/api/users/${resetUser.id}`, { password: newPassword });
      setResetSuccess('Password reset successfully. User should change it on next login.');
      setNewPassword('');
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  }

  async function handleToggleStatus(userId: number, currentStatus: boolean) {
    setToggleError('');
    try {
      await api.patch(`/api/users/${userId}/status`, { isActive: !currentStatus });
      void fetchUsers();
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : 'Failed to update user status');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">Manage team member accounts</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="mr-2 h-4 w-4" />
              New User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="create-fullName">Full Name</Label>
                <Input
                  id="create-fullName"
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-username">Username</Label>
                <Input
                  id="create-username"
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Password</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  required
                  minLength={8}
                />
                <p className="text-xs text-gray-500">{PASSWORD_HINT}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-role">Role</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v as 'admin' | 'user' }))}
                >
                  <SelectTrigger id="create-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {createError && <p className="text-sm text-red-500">{createError}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create User'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {toggleError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {toggleError}
            <Button variant="ghost" size="sm" onClick={() => setToggleError('')}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoadingUsers ? (
        <p className="text-sm text-gray-500">Loading users...</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.fullName}</TableCell>
                  <TableCell className="text-gray-500">{u.username}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? 'outline' : 'destructive'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {u.lastLoginAt
                      ? formatDate(u.lastLoginAt)
                      : 'Never'}
                  </TableCell>
                  <TableCell>
                    {u.id !== currentUser?.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(u)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openResetDialog(u)}>
                            <KeyRound className="mr-2 h-4 w-4" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setConfirmToggle(u)}>
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User — {editingUser?.fullName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditUser} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-fullName">Full Name</Label>
              <Input
                id="edit-fullName"
                value={editForm.fullName}
                onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as 'admin' | 'user' }))}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editError && <p className="text-sm text-red-500">{editError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSavingEdit}>
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmToggle !== null}
        onOpenChange={(open) => { if (!open) setConfirmToggle(null); }}
        title={confirmToggle?.isActive ? 'Deactivate User?' : 'Activate User?'}
        description={
          confirmToggle?.isActive
            ? `${confirmToggle.fullName} will be locked out immediately.`
            : `${confirmToggle?.fullName} will regain access.`
        }
        confirmLabel={confirmToggle?.isActive ? 'Deactivate' : 'Activate'}
        confirmVariant={confirmToggle?.isActive ? 'destructive' : 'default'}
        onConfirm={() => {
          if (confirmToggle) {
            void handleToggleStatus(confirmToggle.id, confirmToggle.isActive);
            setConfirmToggle(null);
          }
        }}
      />

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password — {resetUser?.fullName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="reset-password">New Password</Label>
              <Input
                id="reset-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
              <p className="text-xs text-gray-500">{PASSWORD_HINT}</p>
            </div>
            {resetError && <p className="text-sm text-red-500">{resetError}</p>}
            {resetSuccess && <p className="text-sm text-green-600">{resetSuccess}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetDialogOpen(false)}
              >
                {resetSuccess ? 'Done' : 'Cancel'}
              </Button>
              {!resetSuccess && (
                <Button type="submit" disabled={isResetting}>
                  {isResetting ? 'Resetting...' : 'Reset Password'}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
