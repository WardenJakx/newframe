import React from 'react'
import Restore from 'react-restore'
import link from '../../../../../resources/link'

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
    let permissionList = Object.keys(permissions).sort((a: any, b: any) => (a.origin < b.origin ? -1 : 1))
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
                        <div className='signerPermissionNoPermissions'>No Permissions Set</div>
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
                              className={
                                permissions[o].provider
                                  ? 'signerPermissionToggle signerPermissionToggleOn'
                                  : 'signerPermissionToggle'
                              }
                              onClick={(_: any) =>
                                link.send('tray:action', 'toggleAccess', this.props.account, o)
                              }
                            >
                              <div className='signerPermissionToggleSwitch' />
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
        <div className='clearPermissionsButton'>
          <div
            onClick={() => {
              link.send('tray:action', 'clearPermissions', this.props.account)
            }}
            className='moduleButton'
          >
            Clear All Permissions
          </div>
        </div>
      </div>
    )
  }
}

export default Restore.connect(DappsPermissionsExpanded)
