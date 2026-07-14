import link from '../../../../resources/link'

const ReloadSignerButton = ({ id }) => (
  <div
    className='signerControlOption'
    onMouseDown={() => {
      void link.executeCommand({ type: 'signer.reload', signerId: id })
    }}
  >
    Reload Signer
  </div>
)

export default ReloadSignerButton
