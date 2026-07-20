import { Icon } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { RequestActions } from '../../../../../resources/Components/RequestActions'
import link from '../../../../../resources/link'

interface TxApprovalProps {
  req: { handlerId: string }
  approval: {
    type: 'approveOtherChain' | 'approveGasLimit'
    data?: { message?: string }
  }
}

export default function TxApproval({ req, approval }: TxApprovalProps) {
  return (
    <Surface border='danger' padding='medium' radius='card' tone='card'>
      <Stack gap='medium'>
        <Inline align='center' gap='small' justify='center'>
          <Icon name='warning' size='large' tone='danger' />
          <Text align='center' tone='danger' variant='title'>
            Estimated to fail
          </Text>
        </Inline>
        {approval.data?.message ? (
          <Text align='center' tone='secondary' variant='supporting'>
            {approval.data.message}
          </Text>
        ) : null}
        <RequestActions
          primary={{
            label: 'Proceed',
            onPress: () =>
              void link.executeCommand({
                type: 'request.approval-confirm',
                requestId: req.handlerId,
                approvalType: approval.type
              })
          }}
          secondary={{
            label: 'Reject',
            onPress: () => void link.executeCommand({ type: 'request.reject', requestId: req.handlerId })
          }}
        />
      </Stack>
    </Surface>
  )
}
