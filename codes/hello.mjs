export const handler = async(event, context) => {
	console.info("EVENT\n" + JSON.stringify(event, null, 2))
        const response = {
                event:event,
                context:context,
                statusCode:200,
                body: JSON.stringify({
                        message:"Success"
                })
        }
        return response
}
