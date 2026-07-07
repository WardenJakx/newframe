export const INITIAL_SEND_TOKEN_ROWS = 50
export const SEND_TOKEN_ROWS_INCREMENT = 50

export interface SendWorkflowState {
  amount: string
  error: string
  recipient: any | null
  recipientInput: string
  recipientOpen: boolean
  selectedAssetKey: string
  status: string
  submitting: boolean
  tokenOpen: boolean
  tokenRowsVisible: number
}

export type SendWorkflowAction =
  | { type: 'clearRecipient' }
  | { type: 'selectAsset'; selectedAssetKey: string }
  | { type: 'selectRecipient'; recipient: any }
  | { type: 'setAmount'; amount: string }
  | { type: 'setMaxAmount'; amount: string }
  | { type: 'setRecipientInput'; recipientInput: string }
  | { type: 'setTokenOpen'; tokenOpen: boolean }
  | { type: 'showMoreTokens' }
  | { type: 'submitFailed'; error: string }
  | { type: 'submitStarted' }
  | { type: 'submitSucceeded' }
  | { type: 'toggleRecipientOpen' }
  | { type: 'validationFailed'; error: string }

export function createInitialSendState(assetId?: string | null): SendWorkflowState {
  return {
    amount: '1',
    error: '',
    recipient: null,
    recipientInput: '',
    recipientOpen: true,
    selectedAssetKey: assetId || '',
    status: '',
    submitting: false,
    tokenOpen: false,
    tokenRowsVisible: INITIAL_SEND_TOKEN_ROWS
  }
}

export function sendReducer(state: SendWorkflowState, action: SendWorkflowAction): SendWorkflowState {
  switch (action.type) {
    case 'clearRecipient':
      return {
        ...state,
        recipient: null,
        recipientInput: '',
        recipientOpen: true
      }
    case 'selectAsset':
      return {
        ...state,
        error: '',
        selectedAssetKey: action.selectedAssetKey,
        tokenOpen: false
      }
    case 'selectRecipient':
      return {
        ...state,
        error: '',
        recipient: action.recipient,
        recipientInput: '',
        recipientOpen: false
      }
    case 'setAmount':
      return {
        ...state,
        amount: action.amount,
        error: '',
        status: ''
      }
    case 'setMaxAmount':
      return {
        ...state,
        amount: action.amount,
        error: ''
      }
    case 'setRecipientInput':
      return {
        ...state,
        error: '',
        recipientInput: action.recipientInput,
        recipientOpen: true
      }
    case 'setTokenOpen':
      return {
        ...state,
        recipientOpen: action.tokenOpen ? false : state.recipientOpen,
        tokenOpen: action.tokenOpen
      }
    case 'showMoreTokens':
      return {
        ...state,
        tokenRowsVisible: state.tokenRowsVisible + SEND_TOKEN_ROWS_INCREMENT
      }
    case 'submitFailed':
      return {
        ...state,
        error: action.error,
        status: '',
        submitting: false
      }
    case 'submitStarted':
      return {
        ...state,
        error: '',
        status: 'Confirm in Newframe',
        submitting: true
      }
    case 'submitSucceeded':
      return {
        ...state,
        status: 'Transaction submitted',
        submitting: false
      }
    case 'toggleRecipientOpen':
      return {
        ...state,
        recipientOpen: !state.recipientOpen
      }
    case 'validationFailed':
      return {
        ...state,
        error: action.error
      }
    default:
      return state
  }
}
