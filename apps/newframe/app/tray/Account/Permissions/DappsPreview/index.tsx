import React from 'react'
import Restore from 'react-restore'
import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import { matchFilter } from '../../../../../resources/utils'

import { Cluster, ClusterRow, ClusterValue } from '../../../../../resources/Components/Cluster'

class DappsPermissionsPreview extends React.Component<any, any> {
  declare store: Store
  moduleRef: React.RefObject<HTMLDivElement | null>
  resizeObserver?: ResizeObserver

  constructor(props: any, context?: any) {
    super(props, context)
    this.moduleRef = React.createRef()
    if (!this.props.expanded) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.moduleRef && this.moduleRef.current) {
          link.send('tray:action', 'updateAccountModule', this.props.moduleId, {
            height: this.moduleRef.current.clientHeight
          })
        }
      })
    }
  }

  override componentDidMount() {
    if (this.resizeObserver) this.resizeObserver.observe(this.moduleRef.current as Element)
  }

  override componentWillUnmount() {
    if (this.resizeObserver) this.resizeObserver.disconnect()
  }

  override render() {
    const permissions = this.store('main.permissions', this.props.account) || {}
    let permissionList = Object.keys(permissions)
      .filter((o) => {
        const { filter = '' } = this.props
        return matchFilter(filter, [permissions[o].origin])
      })
      .sort((a: any, b: any) => (a.origin < b.origin ? -1 : 1))
    if (!this.props.expanded) permissionList = permissionList.slice(0, 4)

    return (
      <div className='balancesBlock' ref={this.moduleRef}>
        <div className='moduleHeader'>
          <span>{svg.window(14)}</span>
          <span>{'Dapps'}</span>
        </div>
        <Cluster>
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
        </Cluster>
        <div className='signerBalanceTotal'>
          <div className='signerBalanceButtons'>
            <div
              className='signerBalanceButton signerBalanceShowAll'
              onClick={() => {
                const crumb = {
                  view: 'expandedModule',
                  data: {
                    id: this.props.moduleId,
                    account: this.props.account
                  }
                }
                link.send('nav:forward', 'panel', crumb)
              }}
            >
              More
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default Restore.connect(DappsPermissionsPreview)
