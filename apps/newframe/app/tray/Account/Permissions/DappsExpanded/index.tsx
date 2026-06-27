import React from 'react'
import Restore from 'react-restore'
import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'

import { ClusterBox, Cluster, ClusterRow, ClusterValue } from '../../../../../resources/Components/Cluster'

class DappsPermissionsExpanded extends React.Component<any, any> {
  declare store: Store
  moduleRef: React.RefObject<HTMLDivElement | null>

  constructor(props: any, context?: any) {
    super(props, context)
    this.moduleRef = React.createRef()
  }

  override render() {
    const permissions = this.store('main.permissions', this.props.account) || {}
    let permissionList = Object.keys(permissions)
      .filter((o) => permissions[o]?.provider)
      .sort((a: any, b: any) => (permissions[a].origin < permissions[b].origin ? -1 : 1))
    if (!this.props.expanded) permissionList = permissionList.slice(0, 3)

    return (
      <div className='accountViewScroll'>
        <ClusterBox style={{ marginTop: '20px' }}>
          <Cluster>
            <div className='moduleMainPermissions'>
              {permissionList.length === 0 ? (
                <ClusterRow>
                  <ClusterValue>
                    <div className='signerPermission'>
                      <div className='signerPermissionControls'>
                        <div className='signerPermissionNoPermissions'>No Connected Websites</div>
                      </div>
                    </div>
                  </ClusterValue>
                </ClusterRow>
              ) : (
                permissionList.map((o) => {
                  return (
                    <ClusterRow key={o}>
                      <ClusterValue pointerEvents={true}>
                        <div className='signerPermission'>
                          <div className='signerPermissionControls'>
                            <div className='signerPermissionOrigin'>{permissions[o].origin}</div>
                            <div
                              aria-label={`Clear ${permissions[o].origin}`}
                              className='signerPermissionClear'
                              onClick={() =>
                                link.send('tray:action', 'revokePermission', this.props.account, o)
                              }
                              role='button'
                              tabIndex={0}
                              title={`Clear ${permissions[o].origin}`}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  link.send('tray:action', 'revokePermission', this.props.account, o)
                                }
                              }}
                            >
                              {svg.trash(14)}
                            </div>
                          </div>
                        </div>
                      </ClusterValue>
                    </ClusterRow>
                  )
                })
              )}
            </div>
          </Cluster>
        </ClusterBox>
        {permissionList.length ? (
          <div className='clearPermissionsButton'>
            <div
              onClick={() => {
                link.send('tray:action', 'clearPermissions', this.props.account)
              }}
              className='moduleButton'
            >
              Clear All Websites
            </div>
          </div>
        ) : null}
      </div>
    )
  }
}

export default Restore.connect(DappsPermissionsExpanded)
