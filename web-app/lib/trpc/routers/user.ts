import { z } from 'zod';
import { router, publicProcedure } from '../init';

export const userRouter = router({
  // Create or update user
  upsert: publicProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phoneNumber: z.string().min(1),
        email: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userName = `${input.firstName}_${input.lastName}`;

      // Check if user exists by phone number
      const { data: existingUser } = await ctx.supabase
        .from('HPSecretaryData')
        .select('*')
        .eq('phone_number', input.phoneNumber)
        .single();

      if (existingUser) {
        // Update existing user
        const { data, error } = await ctx.supabase
          .from('HPSecretaryData')
          .update({
            user_name: userName,
            phone_number: input.phoneNumber,
            composio_id: input.phoneNumber, // Set composio_id to phone number (used as userId)
          })
          .eq('phone_number', input.phoneNumber)
          .select()
          .single();

        if (error) throw new Error(error.message);
        return { success: true, user: data };
      } else {
        // Create new user
        const { data, error } = await ctx.supabase
          .from('HPSecretaryData')
          .insert({
            user_name: userName,
            phone_number: input.phoneNumber,
            composio_id: input.phoneNumber, // Set composio_id to phone number (used as userId)
          })
          .select()
          .single();

        if (error) throw new Error(error.message);
        return { success: true, user: data };
      }
    }),

  // Get user by phone number
  getByPhone: publicProcedure
    .input(z.object({ phoneNumber: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('HPSecretaryData')
        .select('*')
        .eq('phone_number', input.phoneNumber)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(error.message);
      }

      return data;
    }),

  // Update composio_id for a user
  updateComposioId: publicProcedure
    .input(
      z.object({
        phoneNumber: z.string(),
        composioId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('HPSecretaryData')
        .update({ composio_id: input.composioId })
        .eq('phone_number', input.phoneNumber)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return { success: true, user: data };
    }),
});



