import Restore from 'react-restore'

import AddToken from './AddToken'
import CustomTokens from './CustomTokens'

const AddTokenForm = ({ store, data }: any) => {
  return <AddToken req={store('view.notifyData')} data={data} />
}

// NOTE: `this` is preserved from the original JS — it is not bound for
// function components, so `this.store` resolves the same way it did pre-conversion
function Tokens(this: any, { data }: any) {
  return (
    <>{data.notify === 'addToken' ? <AddTokenForm store={this.store} data={data} /> : <CustomTokens />}</>
  )
}

export default Restore.connect(Tokens)
