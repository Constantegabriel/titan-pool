let workspaceId: string | null = null

/** Conta ativa: usada como pasta das fotos no armazenamento. */
export const setWorkspaceId = (id: string | null) => {
  workspaceId = id
}
export const getWorkspaceId = () => workspaceId
